/**
 * The two paid providers, each behind a SpendGuard (see spendGuard.js) and
 * each with a canned fallback so the app never breaks for a visitor:
 *   - Pl@ntNet identifies the species from the photo (PLANTNET_API_KEY).
 *   - OpenAI writes the care guide for that species (OPENAI_API_KEY).
 * With no key, an exhausted daily counter, or a provider error, the bundled
 * demo plants answer instead and the response is flagged `demo: true`.
 */
const axios = require('axios');
const FormData = require('form-data');
const OpenAI = require('openai');
const { DEMO_PLANTS, toCandidate, pickDemoPlant, findCannedCare } = require('./demoPlants');

const plantNet = axios.create({
  baseURL: 'https://my-api.plantnet.org/v2',
  timeout: 25000,
  maxContentLength: 6 * 1024 * 1024,
  maxBodyLength: 6 * 1024 * 1024,
  headers: { accept: 'application/json' },
});

async function identifyWithPlantNet({ buffer, apiKey }) {
  const form = new FormData();
  form.append('images', buffer, { filename: 'plant.jpg', contentType: 'image/jpeg' });
  form.append('organs', 'auto');
  const response = await plantNet.post(`/identify/all?api-key=${encodeURIComponent(apiKey)}`, form, { headers: form.getHeaders() });
  const results = response.data && response.data.results;
  if (!Array.isArray(results) || results.length === 0) throw new Error('Pl@ntNet returned no results');
  return results.slice(0, 5).map((r) => ({ species: r.species, score: r.score }));
}

/**
 * Identify a plant. `guard` is the Pl@ntNet SpendGuard. Returns
 * { candidates, demo, reason } where reason explains a demo answer.
 */
async function identify({ buffer, guard, apiKey = process.env.PLANTNET_API_KEY, log = console }) {
  if (!apiKey) {
    return { candidates: [toCandidate(pickDemoPlant(buffer))], demo: true, reason: 'no_plantnet_key' };
  }
  const slot = await guard.tryAcquire();
  if (!slot.allowed) {
    return { candidates: [toCandidate(pickDemoPlant(buffer))], demo: true, reason: 'plantnet_daily_limit', spend: slot };
  }
  try {
    const candidates = await identifyWithPlantNet({ buffer, apiKey });
    return { candidates, demo: false, spend: slot };
  } catch (error) {
    log.error('Pl@ntNet failed, using demo identification:', error.message);
    return { candidates: [toCandidate(pickDemoPlant(buffer))], demo: true, reason: 'plantnet_error', spend: slot };
  }
}

const CARE_SYSTEM_PROMPT = `You are a plant care expert. Return a JSON object with exactly these keys:
"watering", "light", "temperature", "humidity", "soil", "fertilizer" (each a short practical paragraph for a home gardener),
and "soilMoisture": {"minVWC": number, "maxVWC": number, "optimalVWC": number, "wateringThreshold": number}
(volumetric water content percentages 0-100 with minVWC < wateringThreshold < optimalVWC < maxVWC;
typical: min 10-20, threshold 15-25, optimal 25-35, max 40-60). Temperatures in both Celsius and Fahrenheit. Be concise.`;

async function careWithOpenAI({ species, apiKey }) {
  const openai = new OpenAI({ apiKey, timeout: 25000, maxRetries: 0 });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CARE_SYSTEM_PROMPT },
      { role: 'user', content: `Care instructions for ${species}.` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 700,
  });
  const care = JSON.parse(completion.choices[0].message.content);
  for (const k of ['watering', 'light', 'temperature', 'humidity', 'soil', 'fertilizer']) {
    if (typeof care[k] !== 'string') throw new Error(`OpenAI care JSON missing "${k}"`);
  }
  const m = care.soilMoisture || {};
  care.soilMoisture = {
    minVWC: Number(m.minVWC) || 15,
    maxVWC: Number(m.maxVWC) || 45,
    optimalVWC: Number(m.optimalVWC) || 30,
    wateringThreshold: Number(m.wateringThreshold) || 20,
  };
  return care;
}

/** Generic guidance when a species is unknown to the bundled list and OpenAI is unavailable. */
function genericCare(species) {
  const name = String(species || '').toLowerCase();
  const base = {
    watering: 'Water when the top 2-3 cm of soil feels dry. Let the pot drain fully and never leave it standing in water.',
    light: 'Bright, indirect light suits most houseplants; keep out of harsh midday sun.',
    temperature: '18-24 C (65-75 F). Avoid cold draughts and sudden swings.',
    humidity: 'Moderate humidity (40-60 %). A pebble tray or grouping plants helps in dry rooms.',
    soil: 'Well-draining potting mix with some perlite or bark for air.',
    fertilizer: 'Balanced liquid feed at half strength every 2-4 weeks in spring and summer.',
    soilMoisture: { minVWC: 15, maxVWC: 45, optimalVWC: 30, wateringThreshold: 20 },
  };
  if (/cact|succulent|aloe|echeveria|crassula|haworthia|sansevieria/.test(name)) {
    return { ...base,
      watering: 'Water only when the soil is completely dry, every 2-4 weeks. Overwatering is the main risk.',
      light: 'Bright light with some direct sun.',
      soil: 'Gritty cactus or succulent mix.',
      soilMoisture: { minVWC: 5, maxVWC: 25, optimalVWC: 15, wateringThreshold: 8 } };
  }
  if (/fern|moss|calathea|maranta/.test(name)) {
    return { ...base,
      watering: 'Keep the soil consistently moist but not soggy.',
      light: 'Filtered or indirect light only.',
      humidity: 'High humidity (60-80 %) is essential; mist or use a humidifier.',
      soilMoisture: { minVWC: 25, maxVWC: 55, optimalVWC: 40, wateringThreshold: 30 } };
  }
  if (/orchid|phalaenopsis/.test(name)) {
    return { ...base,
      watering: 'Water thoroughly when the bark mix is nearly dry, then drain completely.',
      soil: 'Orchid bark mix with sphagnum moss and perlite.',
      humidity: 'High humidity (50-70 %).',
      soilMoisture: { minVWC: 20, maxVWC: 50, optimalVWC: 35, wateringThreshold: 25 } };
  }
  return base;
}

/**
 * Care guide for a species. Bundled species are answered from the canned
 * list without spending; otherwise OpenAI behind its guard; otherwise generic.
 */
async function careGuide({ species, guard, apiKey = process.env.OPENAI_API_KEY, log = console }) {
  const canned = findCannedCare(species);
  if (canned) return { care: canned, source: 'bundled' };
  if (!apiKey) return { care: genericCare(species), source: 'generic', reason: 'no_openai_key' };
  const slot = await guard.tryAcquire();
  if (!slot.allowed) return { care: genericCare(species), source: 'generic', reason: 'openai_daily_limit', spend: slot };
  try {
    const care = await careWithOpenAI({ species, apiKey });
    return { care, source: 'openai', spend: slot };
  } catch (error) {
    log.error('OpenAI failed, using generic care:', error.message);
    return { care: genericCare(species), source: 'generic', reason: 'openai_error', spend: slot };
  }
}

module.exports = { identify, careGuide, identifyWithPlantNet, careWithOpenAI, genericCare, DEMO_PLANTS };

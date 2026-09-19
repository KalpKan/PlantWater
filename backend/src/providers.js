/**
 * The two external providers, each with a canned fallback so the app never
 * breaks for a visitor:
 *   - Pl@ntNet identifies the species from the photo (PLANTNET_API_KEY on the
 *     server, behind a SpendGuard, see spendGuard.js). With no key, an
 *     exhausted daily counter, or a provider error, the bundled demo plants
 *     answer instead and the response is flagged `demo: true`.
 *   - OpenAI writes a species-specific care guide ONLY with a key the visitor
 *     typed into the app ("Use your own OpenAI key"). That key lives in the
 *     visitor's browser, arrives once per request in the X-OpenAI-Key header,
 *     and is never stored, logged or configured on the server: there is no
 *     OPENAI_API_KEY environment variable, by decision (2026-09-18, no paid
 *     keys in public demos). Without a visitor key the care guide comes from
 *     the bundled library (six common houseplants) or generic guidance.
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

/** Below this top-1 score the answer is shown with a low-confidence warning and the runner-up candidates (spec S2). */
const LOW_CONFIDENCE_SCORE = 0.3;

class NotAPlantError extends Error {
  constructor(message) { super(message); this.code = 'NOT_A_PLANT'; }
}

/**
 * One Pl@ntNet call. Pl@ntNet answers HTTP 404 {"message":"Species not found"}
 * when it sees no plant in the photo (a mug, a face, a wall): that is a normal
 * answer, not an outage, and is raised as NotAPlantError so the caller can
 * refuse the photo instead of guessing. `client` is injectable for tests.
 */
async function identifyWithPlantNet({ buffer, apiKey, client = plantNet }) {
  const form = new FormData();
  form.append('images', buffer, { filename: 'plant.jpg', contentType: 'image/jpeg' });
  form.append('organs', 'auto');
  let response;
  try {
    response = await client.post(`/identify/all?api-key=${encodeURIComponent(apiKey)}`, form, { headers: form.getHeaders() });
  } catch (error) {
    if (error && error.response && error.response.status === 404) throw new NotAPlantError('Pl@ntNet: species not found (no plant in the photo)');
    throw error;
  }
  const results = response.data && response.data.results;
  if (!Array.isArray(results) || results.length === 0) throw new NotAPlantError('Pl@ntNet returned no results');
  return results.slice(0, 5).map((r) => ({ species: r.species, score: r.score }));
}

/**
 * Identify a plant. `guard` is the Pl@ntNet SpendGuard. Returns
 * { candidates, demo, reason, lowConfidence, notAPlant } where reason explains a
 * demo answer. notAPlant: true (empty candidates) means Pl@ntNet looked and saw
 * no plant; the API answers 422 and saves nothing. Only real failures (5xx,
 * network, timeout) fall back to the bundled demo list.
 */
async function identify({ buffer, guard, apiKey = process.env.PLANTNET_API_KEY, log = console, client = plantNet }) {
  if (!apiKey) {
    return { candidates: [toCandidate(pickDemoPlant(buffer))], demo: true, reason: 'no_plantnet_key', lowConfidence: false };
  }
  const slot = await guard.tryAcquire();
  if (!slot.allowed) {
    return { candidates: [toCandidate(pickDemoPlant(buffer))], demo: true, reason: 'plantnet_daily_limit', lowConfidence: false, spend: slot };
  }
  try {
    const candidates = await identifyWithPlantNet({ buffer, apiKey, client });
    const top = Number(candidates[0] && candidates[0].score) || 0;
    return { candidates, demo: false, lowConfidence: top < LOW_CONFIDENCE_SCORE, spend: slot };
  } catch (error) {
    if (error && error.code === 'NOT_A_PLANT') {
      return { candidates: [], demo: false, notAPlant: true, reason: 'plantnet_species_not_found', lowConfidence: false, spend: slot };
    }
    log.error('Pl@ntNet failed, using demo identification:', error.message);
    return { candidates: [toCandidate(pickDemoPlant(buffer))], demo: true, reason: 'plantnet_error', lowConfidence: false, spend: slot };
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
  // Drought-tolerant group: succulents plus the rhizome/rosette houseplants that rot when kept moist.
  if (/cact|succulent|aloe|echeveria|crassula|haworthia|sansevieria|dracaena trifasciata|zamioculcas|zamiifolia|kalanchoe|gasteria|sedum|sempervivum|agave|yucca|beaucarnea|lithops/.test(name)) {
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
 * Scrub a secret (and anything that looks like an OpenAI key, including the
 * starred form OpenAI itself puts in its error messages, "sk-inval***mnop")
 * out of text before it is logged or returned.
 */
function redactSecret(text, secret) {
  let out = String(text || '');
  if (secret) out = out.split(secret).join('[redacted]');
  return out.replace(/\bsk-[A-Za-z0-9_*.-]*[A-Za-z0-9_*-]/g, 'sk-[redacted]');
}

/** Short, key-free classification of an OpenAI failure for the visitor ("why did my key not work?"). */
function classifyOpenAIError(error) {
  const status = error && (error.status || (error.response && error.response.status));
  if (status === 401) return 'invalid_key';
  if (status === 429) return 'rate_limited_or_no_credit';
  if (status === 403) return 'forbidden';
  if (/timeout|timed out|ETIMEDOUT|ECONN/i.test(String(error && error.message))) return 'timeout';
  return 'error';
}

/**
 * Care guide for a species.
 *   - visitorKey set (the X-OpenAI-Key header): OpenAI writes the guide on the
 *     visitor's own account, so there is no server-side spend guard. On any
 *     failure the bundled/generic guide answers and `reason` says why, with
 *     `openaiError` classifying the failure (never the key or the raw message).
 *   - no visitorKey: bundled species answer from the canned list, anything
 *     else gets generic guidance. The server has no OpenAI key of its own.
 * `openai` is injectable for tests (defaults to the real careWithOpenAI).
 */
async function careGuide({ species, visitorKey, log = console, openai = careWithOpenAI }) {
  const canned = findCannedCare(species);
  const key = typeof visitorKey === 'string' ? visitorKey.trim() : '';
  if (key) {
    try {
      const care = await openai({ species, apiKey: key });
      return { care, source: 'openai', keySource: 'visitor' };
    } catch (error) {
      const openaiError = classifyOpenAIError(error);
      // Only the classification and the HTTP status are logged: OpenAI's own message repeats the
      // first and last characters of the key ("sk-inval***mnop"), and the app promises it is never logged.
      const status = error && (error.status || (error.response && error.response.status));
      log.error('OpenAI (visitor key) failed, using the built-in guide:', openaiError, status ? `HTTP ${status}` : '(no HTTP status)');
      return {
        care: canned || genericCare(species),
        source: canned ? 'bundled' : 'generic',
        reason: 'openai_error',
        openaiError,
        keySource: 'visitor',
      };
    }
  }
  if (canned) return { care: canned, source: 'bundled' };
  return { care: genericCare(species), source: 'generic', reason: 'no_openai_key' };
}

module.exports = { identify, careGuide, NotAPlantError, LOW_CONFIDENCE_SCORE, identifyWithPlantNet, careWithOpenAI, genericCare, redactSecret, classifyOpenAIError, DEMO_PLANTS };

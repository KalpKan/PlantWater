/**
 * Six common houseplants with Pl@ntNet-shaped identification results and
 * complete care guidance. Used when no Pl@ntNet / OpenAI key is configured,
 * when the daily spend guard is exhausted, or when a provider call fails, so
 * the app always works for a visitor. Results from this file are labelled
 * `demo: true` in the API response and "Demo result" in the UI.
 */
const DEMO_PLANTS = [
  {
    species: 'Monstera deliciosa',
    commonNames: ['Swiss cheese plant', 'Split-leaf philodendron'],
    family: 'Araceae',
    score: 0.91,
    care: {
      watering: 'Water when the top 5 cm of soil is dry, roughly every 7-10 days; less in winter. Let excess water drain and never leave the pot standing in water.',
      light: 'Bright, indirect light. A metre or two from an east or west window is ideal; harsh midday sun scorches the leaves.',
      temperature: '18-27 C (65-80 F). Keep above 13 C (55 F) and away from cold draughts.',
      humidity: 'Moderate to high (50-60 %). Mist occasionally or group with other plants.',
      soil: 'Chunky, well-draining aroid mix: potting soil with orchid bark and perlite.',
      fertilizer: 'Balanced liquid feed at half strength once a month from spring to early autumn; none in winter.',
      soilMoisture: { minVWC: 15, maxVWC: 45, optimalVWC: 30, wateringThreshold: 20 },
    },
  },
  {
    species: 'Epipremnum aureum',
    commonNames: ['Golden pothos', "Devil's ivy"],
    family: 'Araceae',
    score: 0.89,
    care: {
      watering: 'Allow the top half of the soil to dry between waterings, about every 1-2 weeks. Droopy leaves mean it is thirsty; yellow leaves mean too much water.',
      light: 'Tolerates low light but grows fastest in bright, indirect light. Variegation fades in deep shade.',
      temperature: '18-29 C (65-85 F). Avoid anything below 10 C (50 F).',
      humidity: 'Average room humidity is fine; higher humidity gives larger leaves.',
      soil: 'Any well-draining potting mix; add perlite if it stays wet for long.',
      fertilizer: 'Balanced liquid feed every 4-6 weeks in spring and summer.',
      soilMoisture: { minVWC: 12, maxVWC: 42, optimalVWC: 27, wateringThreshold: 18 },
    },
  },
  {
    // Pl@ntNet (and POWO) use the accepted name Dracaena trifasciata; the trade still says Sansevieria.
    species: 'Dracaena trifasciata',
    synonyms: ['Sansevieria trifasciata', 'Sansevieria zeylanica', 'Dracaena zeylanica', 'Sansevieria cylindrica', 'Dracaena angolensis', 'Sansevieria laurentii'],
    genera: ['Sansevieria'], // not "Dracaena": D. marginata / D. fragrans are not bone-dry plants
    commonNames: ['Snake plant', "Mother-in-law's tongue"],
    family: 'Asparagaceae',
    score: 0.93,
    care: {
      watering: 'Water only when the soil is completely dry, every 2-4 weeks (every 6-8 weeks in winter). Overwatering is the one thing that kills it.',
      light: 'Anything from low light to full sun; bright, indirect light is best.',
      temperature: '15-30 C (60-85 F). Keep above 10 C (50 F).',
      humidity: 'Low to average humidity; it does not need misting.',
      soil: 'Gritty cactus or succulent mix with sharp drainage.',
      fertilizer: 'Cactus fertilizer at half strength once or twice during the growing season.',
      soilMoisture: { minVWC: 5, maxVWC: 28, optimalVWC: 14, wateringThreshold: 8 },
    },
  },
  {
    species: 'Spathiphyllum wallisii',
    commonNames: ['Peace lily'],
    family: 'Araceae',
    score: 0.88,
    care: {
      watering: 'Keep the soil lightly moist; water about once a week when the top 2-3 cm feels dry. It wilts dramatically when thirsty and recovers within hours of a drink.',
      light: 'Medium to bright, indirect light. Direct sun browns the leaves; it still flowers in a bright, sunless room.',
      temperature: '18-27 C (65-80 F). Sensitive to cold draughts.',
      humidity: 'High humidity (50 % or more) keeps leaf tips from browning; mist or use a pebble tray.',
      soil: 'Rich, peat-based potting mix that holds moisture but drains well.',
      fertilizer: 'Balanced liquid feed at quarter strength every 6 weeks in spring and summer.',
      soilMoisture: { minVWC: 22, maxVWC: 52, optimalVWC: 38, wateringThreshold: 28 },
    },
  },
  {
    species: 'Zamioculcas zamiifolia',
    commonNames: ['ZZ plant', 'Zanzibar gem'],
    family: 'Araceae',
    score: 0.9,
    care: {
      watering: 'Water only when the soil is completely dry, every 2-3 weeks (monthly in winter). Its rhizomes store water, so when in doubt, wait; yellowing stems mean too much water.',
      light: 'Low to bright, indirect light; it tolerates dim corners. Keep out of hot direct sun.',
      temperature: '18-26 C (65-79 F). Keep above 10 C (50 F).',
      humidity: 'Average room humidity is fine; no misting needed.',
      soil: 'Fast-draining mix: potting soil with plenty of perlite or a cactus mix.',
      fertilizer: 'Balanced liquid feed at half strength once or twice in spring and summer.',
      soilMoisture: { minVWC: 5, maxVWC: 28, optimalVWC: 14, wateringThreshold: 8 },
    },
  },
  {
    species: 'Ficus lyrata',
    commonNames: ['Fiddle-leaf fig'],
    family: 'Moraceae',
    score: 0.86,
    care: {
      watering: 'Water thoroughly when the top 5 cm of soil is dry, about every 7-10 days, then let it drain fully. Consistency matters more than quantity.',
      light: 'Lots of bright, indirect light with a little gentle morning sun. Rotate a quarter turn each week so it grows straight.',
      temperature: '18-24 C (65-75 F); dislikes swings and cold draughts.',
      humidity: 'Moderate (40-60 %). Wipe the large leaves monthly so they can breathe.',
      soil: 'Well-draining indoor potting mix with added bark or perlite.',
      fertilizer: 'High-nitrogen liquid feed (3-1-2) monthly in spring and summer.',
      soilMoisture: { minVWC: 15, maxVWC: 45, optimalVWC: 30, wateringThreshold: 20 },
    },
  },
];

function toCandidate(plant) {
  return {
    score: plant.score,
    species: {
      scientificNameWithoutAuthor: plant.species,
      scientificName: plant.species,
      commonNames: plant.commonNames,
      genus: { scientificNameWithoutAuthor: plant.species.split(' ')[0] },
      family: { scientificNameWithoutAuthor: plant.family },
    },
  };
}

/** Deterministic choice: the same photo always identifies as the same demo plant. */
function pickDemoPlant(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''));
  let h = 0;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) h = (h * 31 + bytes[i]) >>> 0;
  h = (h + bytes.length) >>> 0;
  return DEMO_PLANTS[h % DEMO_PLANTS.length];
}

/**
 * Canned care for a species: matched on the accepted name, then on a listed
 * synonym (old names still in circulation, e.g. Sansevieria trifasciata for
 * the snake plant), then on the genus. An entry's `genera` list overrides the
 * genus taken from its name when the genus is too broad to share the guide.
 */
function findCannedCare(speciesName) {
  const name = String(speciesName || '').trim().toLowerCase();
  if (!name) return null;
  const exact = DEMO_PLANTS.find((p) => p.species.toLowerCase() === name
    || (p.synonyms || []).some((syn) => syn.toLowerCase() === name));
  if (exact) return exact.care;
  const genus = name.split(/\s+/)[0];
  const byGenus = DEMO_PLANTS.find((p) => (p.genera || [p.species.split(' ')[0]]).some((g) => g.toLowerCase() === genus));
  return byGenus ? byGenus.care : null;
}

module.exports = { DEMO_PLANTS, toCandidate, pickDemoPlant, findCannedCare };

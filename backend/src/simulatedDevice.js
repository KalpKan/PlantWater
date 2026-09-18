/**
 * Simulated soil-moisture sensor, so a visitor can use the whole app without
 * an ESP8266. Pure functions: the route layer feeds them the plant document
 * and the clock, so they are easy to test and identical on every request.
 *
 * Model: right after watering the soil sits at maxVWC (volumetric water
 * content, %) and dries out to minVWC over DRY_OUT_HOURS, with a small
 * plant-specific wobble so two plants never read exactly the same. Readings
 * never leave [minVWC, maxVWC] and are rounded to one decimal.
 */
const DRY_OUT_HOURS = 72;
const DEFAULTS = { minVWC: 15, maxVWC: 45, wateringThreshold: 20, optimalVWC: 30 };
const HOUR_MS = 3600 * 1000;

function seedFrom(str) {
  // FNV-1a over the id, mapped to [0, 1). Stable across runs and machines.
  let h = 0x811c9dc5;
  for (const ch of String(str || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 10007) / 10007;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function simulateReading({ plantId, lastWateredMs, nowMs, minVWC, maxVWC, wateringThreshold, optimalVWC }) {
  const min = num(minVWC, DEFAULTS.minVWC);
  const max = Math.max(min + 1, num(maxVWC, DEFAULTS.maxVWC));
  const threshold = num(wateringThreshold, DEFAULTS.wateringThreshold);
  const optimal = num(optimalVWC, DEFAULTS.optimalVWC);
  const now = num(nowMs, Date.now());
  const watered = num(lastWateredMs, NaN);
  // No watering on record: treat the soil as fully dry.
  const hours = Number.isFinite(watered) ? Math.max(0, (now - watered) / HOUR_MS) : DRY_OUT_HOURS;

  const span = max - min;
  const frac = Math.min(1, hours / DRY_OUT_HOURS);
  // Slightly faster drying at first (fresh water drains), easing off as it dries.
  const curve = 1 - Math.pow(1 - frac, 1.35);
  const base = max - span * curve;
  // Plant-specific wobble that is zero at the moment of watering and at full dry-out.
  const wobble = Math.sin(hours / 5 + seedFrom(plantId) * Math.PI * 2) * span * 0.02 * Math.sin(Math.PI * frac);
  const raw = Math.min(max, Math.max(min, base + wobble));
  const currentVWC = Math.round(raw * 10) / 10;

  return {
    source: 'simulated',
    label: 'Simulated sensor',
    currentVWC,
    needsWater: currentVWC <= threshold,
    hoursSinceWatered: Math.round(hours * 10) / 10,
    lastWatered: Number.isFinite(watered) ? new Date(watered).toISOString() : null,
    minVWC: min,
    maxVWC: max,
    optimalVWC: optimal,
    wateringThreshold: threshold,
    dryOutHours: DRY_OUT_HOURS,
  };
}

function waterPlant({ nowMs, maxVWC }) {
  const now = num(nowMs, Date.now());
  return { lastWateredMs: now, lastWatered: new Date(now).toISOString(), currentVWC: Math.max(1, num(maxVWC, DEFAULTS.maxVWC)) };
}

/** True only once a real ESP8266 has POSTed a moisture reading for this plant. */
function deviceHasReported(plant) {
  return Boolean(plant && plant.deviceReportedAt);
}

module.exports = { simulateReading, waterPlant, deviceHasReported, DRY_OUT_HOURS, DEFAULTS };

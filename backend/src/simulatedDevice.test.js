const {
  simulateReading,
  waterPlant,
  deviceHasReported,
  DRY_OUT_HOURS,
} = require('./simulatedDevice');

const H = 3600 * 1000;
const t0 = Date.parse('2026-09-18T12:00:00Z');
const plant = { plantId: 'abc123', minVWC: 15, maxVWC: 45, wateringThreshold: 20 };

describe('simulated sensor', () => {
  test('right after watering the soil reads at maxVWC and does not need water', () => {
    const r = simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 });
    expect(r.currentVWC).toBe(45);
    expect(r.needsWater).toBe(false);
    expect(r.source).toBe('simulated');
    expect(r.hoursSinceWatered).toBe(0);
  });

  test('moisture falls over time and reaches minVWC once the soil has dried out', () => {
    const at = (h) => simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 + h * H }).currentVWC;
    const readings = [0, 12, 24, 36, 48, 60, DRY_OUT_HOURS].map(at);
    for (let i = 1; i < readings.length; i++) expect(readings[i]).toBeLessThan(readings[i - 1]);
    expect(at(DRY_OUT_HOURS)).toBe(15);
    expect(at(DRY_OUT_HOURS * 3)).toBe(15);
  });

  test('needsWater flips once the reading is at or below the watering threshold', () => {
    const late = simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 + 70 * H });
    expect(late.currentVWC).toBeLessThanOrEqual(20);
    expect(late.needsWater).toBe(true);
    const early = simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 + 6 * H });
    expect(early.needsWater).toBe(false);
  });

  test('readings stay inside [minVWC, maxVWC] and have one decimal', () => {
    for (let h = 0; h <= 200; h += 5) {
      const v = simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 + h * H }).currentVWC;
      expect(v).toBeGreaterThanOrEqual(15);
      expect(v).toBeLessThanOrEqual(45);
      expect(Number.isInteger(v * 10)).toBe(true);
    }
  });

  test('is deterministic for the same plant and time, and differs between plants', () => {
    const a1 = simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 + 30 * H });
    const a2 = simulateReading({ ...plant, lastWateredMs: t0, nowMs: t0 + 30 * H });
    const b = simulateReading({ ...plant, plantId: 'zzz999', lastWateredMs: t0, nowMs: t0 + 30 * H });
    expect(a1.currentVWC).toBe(a2.currentVWC);
    expect(b.currentVWC).not.toBe(a1.currentVWC);
  });

  test('missing thresholds fall back to sensible defaults and a missing lastWatered means "dry"', () => {
    const r = simulateReading({ plantId: 'x', nowMs: t0 });
    expect(r.minVWC).toBe(15);
    expect(r.maxVWC).toBe(45);
    expect(r.wateringThreshold).toBe(20);
    expect(r.currentVWC).toBe(15);
    expect(r.needsWater).toBe(true);
  });

  test('watering resets the clock and the reading to maxVWC', () => {
    const w = waterPlant({ ...plant, nowMs: t0 + 50 * H });
    expect(w.lastWateredMs).toBe(t0 + 50 * H);
    expect(w.currentVWC).toBe(45);
    const after = simulateReading({ ...plant, lastWateredMs: w.lastWateredMs, nowMs: t0 + 50 * H });
    expect(after.currentVWC).toBe(45);
  });

  test('deviceHasReported is true only when a real ESP8266 has posted a reading', () => {
    expect(deviceHasReported({})).toBe(false);
    expect(deviceHasReported({ deviceConnected: true })).toBe(false);
    expect(deviceHasReported({ deviceReportedAt: '2026-09-18T12:00:00Z' })).toBe(true);
  });
});

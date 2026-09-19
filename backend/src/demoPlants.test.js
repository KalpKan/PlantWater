const { DEMO_PLANTS, pickDemoPlant, findCannedCare, toCandidate } = require('./demoPlants');

describe('bundled demo plants', () => {
  test('ships six common plants with complete care guidance', () => {
    expect(DEMO_PLANTS).toHaveLength(6);
    for (const p of DEMO_PLANTS) {
      expect(p.species).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
      expect(p.commonNames.length).toBeGreaterThan(0);
      for (const k of ['watering', 'light', 'temperature', 'humidity', 'soil', 'fertilizer']) {
        expect(typeof p.care[k]).toBe('string');
      }
      const m = p.care.soilMoisture;
      expect(m.minVWC).toBeLessThan(m.wateringThreshold);
      expect(m.wateringThreshold).toBeLessThan(m.optimalVWC);
      expect(m.optimalVWC).toBeLessThan(m.maxVWC);
    }
  });

  test('the same photo bytes always pick the same plant; different bytes can pick another', () => {
    const a = Buffer.from('leafy green photo bytes');
    const b = Buffer.from('a completely different picture');
    expect(pickDemoPlant(a).species).toBe(pickDemoPlant(a).species);
    const picks = new Set([a, b, Buffer.from('x'), Buffer.from('yy'), Buffer.from('zzz')].map((buf) => pickDemoPlant(buf).species));
    expect(picks.size).toBeGreaterThan(1);
  });

  test('canned care is found by species or by genus, case-insensitively', () => {
    expect(findCannedCare('Monstera deliciosa').watering).toMatch(/water/i);
    expect(findCannedCare('monstera adansonii')).toBe(findCannedCare('Monstera deliciosa'));
    expect(findCannedCare('Quercus robur')).toBeNull();
  });

  test('toCandidate has the Pl@ntNet shape the frontend renders', () => {
    const c = toCandidate(DEMO_PLANTS[0]);
    expect(c.species.scientificNameWithoutAuthor).toBe(DEMO_PLANTS[0].species);
    expect(c.species.commonNames).toEqual(DEMO_PLANTS[0].commonNames);
    expect(c.species.family.scientificNameWithoutAuthor).toBe(DEMO_PLANTS[0].family);
    expect(c.score).toBeGreaterThan(0);
  });
});

describe('drought-tolerant houseplants get dry-out care (TEST round 1 D2)', () => {
  const dry = (care) => {
    expect(care).not.toBeNull();
    expect(care.soilMoisture.wateringThreshold).toBeLessThanOrEqual(12);
    expect(care.watering).toMatch(/completely dry/i);
  };
  test('the snake plant is found under its accepted name Dracaena trifasciata and its old name Sansevieria trifasciata', () => {
    dry(findCannedCare('Dracaena trifasciata'));
    dry(findCannedCare('Sansevieria trifasciata'));
    dry(findCannedCare('sansevieria zeylanica'));
    expect(findCannedCare('Dracaena trifasciata')).toBe(findCannedCare('Sansevieria trifasciata'));
  });
  test('the ZZ plant has a bundled guide', () => {
    dry(findCannedCare('Zamioculcas zamiifolia'));
    dry(findCannedCare('Zamioculcas'));
  });
  test('other Dracaena species do not inherit the snake-plant guide through the genus rule', () => {
    expect(findCannedCare('Dracaena marginata')).toBeNull();
    expect(findCannedCare('Dracaena fragrans')).toBeNull();
  });
});

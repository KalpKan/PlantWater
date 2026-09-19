/**
 * Corpus metric test (offline). Replays what Pl@ntNet answered for every photo
 * in tests/fixtures/plants (ground-truth.json `plantnetCalibration`, recorded
 * 2026-09-19 with the operator key) through the real pipeline: multer limits,
 * sharp normalisation, providers.identify (404 -> not a plant, low-confidence
 * flag), careGuide (bundled / generic), the Firestore write and the response.
 * No network, no Pl@ntNet budget. The live run is scripts/run-corpus.js.
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createApp } = require('./app');
const providers = require('./providers');

const DIR = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'plants');
const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'ground-truth.json'), 'utf8'));
const log = { warn() {}, error() {} };

function fakeFirebase() {
  const store = new Map();
  let autoId = 0;
  const docRef = (p) => ({
    id: p.split('/').pop(), path: p,
    async get() { const d = store.get(p); return { id: p.split('/').pop(), exists: d !== undefined, data: () => (d ? { ...d } : undefined) }; },
    async set(data) { store.set(p, { ...data }); }, async update(data) { store.set(p, { ...(store.get(p) || {}), ...data }); }, async delete() { store.delete(p); },
    collection: (name) => colRef(`${p}/${name}`),
  });
  const colRef = (p) => ({
    doc: (id) => docRef(`${p}/${id || `auto${++autoId}`}`),
    async get() { return { docs: [...store.entries()].filter(([k]) => k.startsWith(`${p}/`) && k.slice(p.length + 1).indexOf('/') === -1).map(([k, d]) => ({ id: k.split('/').pop(), data: () => ({ ...d }) })) }; },
  });
  return {
    db: { store, collection: (name) => colRef(name), async runTransaction(fn) { return fn({ get: (ref) => ref.get(), set: async (ref, data) => ref.update(data) }); } },
    rtdb: { ref: () => ({ set: async () => {}, update: async () => {}, remove: async () => {} }) },
    auth: { verifyIdToken: async () => ({ uid: 'corpus' }) },
    Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) },
    FieldValue: { delete: () => null },
  };
}

/** Pl@ntNet-shaped result list from a calibration record ("Monstera deliciosa 76%"). */
function plantNetResults(item) {
  const cal = item.plantnetCalibration || {};
  if (cal.error) return { error: Object.assign(new Error(cal.error), { response: { status: 404, data: { statusCode: 404, error: 'Not Found', message: 'Species not found' } } }) };
  const results = (cal.top3 || []).map((s, i) => {
    const m = /^(.*) (\d+)%$/.exec(s);
    const name = m ? m[1] : s;
    const score = i === 0 ? cal.score : (m ? Number(m[2]) / 100 : 0);
    const isTruth = item.species.includes(name);
    return { score, species: { scientificNameWithoutAuthor: name, scientificName: name, genus: { scientificNameWithoutAuthor: name.split(' ')[0] }, family: { scientificNameWithoutAuthor: isTruth ? item.family : 'Unknown' }, commonNames: isTruth && item.common ? [item.common] : [] } };
  });
  return { data: { results } };
}

describe('identification corpus (recorded Pl@ntNet answers replayed through the real API)', () => {
  const rows = [];
  let app;
  let current;
  beforeAll(async () => {
    const client = { post: async () => { const r = plantNetResults(current); if (r.error) throw r.error; return r; } };
    const guard = { tryAcquire: async () => ({ allowed: true, count: 1, limit: 50, day: 'test' }) };
    const prov = {
      identify: (args) => providers.identify({ ...args, apiKey: 'replay', guard, client }),
      careGuide: providers.careGuide,
    };
    app = createApp({ firebase: fakeFirebase(), env: { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }, log, now: () => Date.parse('2026-09-19T00:00:00Z'), providers: prov });
    for (const item of truth.items) {
      current = item;
      const res = await request(app).post('/api/identify').set('Authorization', 'Bearer x')
        .attach('image', fs.readFileSync(path.join(DIR, item.file)), { filename: item.file, contentType: item.file.endsWith('.txt') ? 'text/plain' : 'image/jpeg' });
      const body = res.body || {};
      const cands = Array.isArray(body.candidates) ? body.candidates : [];
      const top1 = cands[0] ? cands[0].species.scientificNameWithoutAuthor : null;
      const negative = item.difficulty === 'negative';
      const genus = [].concat(item.genus || []);
      rows.push({
        file: item.file, status: res.status, top1, score: cands[0] ? cands[0].score : null, negative,
        genusOk: !negative && genus.includes(String(top1 || '').split(' ')[0]),
        speciesOk: !negative && item.species.includes(top1),
        top3Ok: !negative && cands.slice(0, 3).some((c) => item.species.includes(c.species.scientificNameWithoutAuthor)),
        negativeOk: negative ? res.status >= 400 && res.status < 500 && !body.savedPlant : null,
        lowConfidence: body.lowConfidence, careBar: item.careBar || null,
        care: body.careInstructions || null, careSource: body.careSource || null, saved: Boolean(body.savedPlant),
      });
    }
  }, 60000);

  const plants = () => rows.filter((r) => !r.negative);

  test('genus top-1 >= 13/15', () => { expect(plants().filter((r) => r.genusOk).length).toBeGreaterThanOrEqual(13); });
  test('species top-1 >= 9/15', () => { expect(plants().filter((r) => r.speciesOk).length).toBeGreaterThanOrEqual(9); });
  test('species in top-3 >= 13/15', () => { expect(plants().filter((r) => r.top3Ok).length).toBeGreaterThanOrEqual(13); });

  test('negatives refused, nothing saved: 3/3 (mug 422, tiny 400, text 400)', () => {
    const neg = rows.filter((r) => r.negative);
    expect(neg).toHaveLength(3);
    expect(neg.map((r) => [r.file, r.status, r.saved])).toEqual([['not-a-plant-mug.jpg', 422, false], ['too-small.jpg', 400, false], ['not-an-image.txt', 400, false]]);
  });

  test('low confidence is flagged exactly when the top score is under 0.3', () => {
    for (const r of plants()) expect([r.file, r.lowConfidence]).toEqual([r.file, r.score < providers.LOW_CONFIDENCE_SCORE]);
  });

  test('care thresholds and wording match each species\' careBar (drought plants dry out, peace lily stays moist)', () => {
    const failures = [];
    for (const r of plants()) {
      if (!r.careBar || !r.care) continue;
      const t = r.care.soilMoisture.wateringThreshold;
      const b = r.careBar;
      if (b.wateringThresholdMax !== undefined && t > b.wateringThresholdMax) failures.push(`${r.file}: threshold ${t} > ${b.wateringThresholdMax} (${r.top1}, ${r.careSource})`);
      if (b.wateringThresholdMin !== undefined && t < b.wateringThresholdMin) failures.push(`${r.file}: threshold ${t} < ${b.wateringThresholdMin} (${r.top1}, ${r.careSource})`);
      if (b.wateringMustMatch && !new RegExp(b.wateringMustMatch, 'i').test(r.care.watering)) failures.push(`${r.file}: watering text lacks "${b.wateringMustMatch}" (${r.top1}, ${r.careSource})`);
    }
    expect(failures).toEqual([]);
  });
});

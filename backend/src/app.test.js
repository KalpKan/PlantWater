const request = require('supertest');
const { createApp } = require('./app');

// A small in-memory Firestore: users/{uid}/plants/{id} + events subcollection, plus spend/{id}.
function fakeFirestore() {
  const store = new Map();
  let autoId = 0;
  const docRef = (path) => ({
    id: path.split('/').pop(),
    path,
    async get() { const d = store.get(path); return { id: path.split('/').pop(), exists: d !== undefined, data: () => (d ? { ...d } : undefined) }; },
    async set(data) { store.set(path, { ...data }); },
    async update(data) { store.set(path, { ...(store.get(path) || {}), ...data }); },
    async delete() { store.delete(path); },
    collection: (name) => colRef(`${path}/${name}`),
  });
  const colRef = (path) => {
    const list = () => [...store.entries()].filter(([p]) => p.startsWith(`${path}/`) && p.slice(path.length + 1).indexOf('/') === -1)
      .map(([p, d]) => ({ id: p.split('/').pop(), data: () => ({ ...d }) }));
    const q = { docs: [], async get() { return { docs: list() }; }, orderBy: () => q, limit: () => q };
    return {
      doc: (id) => docRef(`${path}/${id || `auto${++autoId}`}`),
      async add(data) { const r = docRef(`${path}/auto${++autoId}`); await r.set(data); return r; },
      async get() { return { docs: list() }; },
      orderBy: () => q, limit: () => q,
    };
  };
  const db = {
    store,
    collection: (name) => colRef(name),
    async runTransaction(fn) {
      return fn({ get: (ref) => ref.get(), set: async (ref, data) => ref.update(data) });
    },
  };
  return db;
}

function fakeFirebase({ failDb = false } = {}) {
  const db = fakeFirestore();
  if (failDb) db.collection = () => { throw new Error('UNAVAILABLE: firestore down'); };
  const rtdbWrites = [];
  return {
    db,
    rtdbWrites,
    rtdb: { ref: (p) => ({ set: async (v) => rtdbWrites.push(['set', p, v]), update: async (v) => rtdbWrites.push(['update', p, v]), remove: async () => rtdbWrites.push(['remove', p]) }) },
    auth: { verifyIdToken: async (t) => { if (t !== 'good') throw new Error('bad token'); return { uid: 'u1' }; } },
    Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) },
    FieldValue: { delete: () => null },
  };
}

const env = { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' };
const log = { warn() {}, error() {} };
const t0 = Date.parse('2026-09-18T12:00:00Z');

describe('/api/health', () => {
  test('reports firestore ok and the demo/bundled modes when no keys are set', async () => {
    const app = createApp({ firebase: fakeFirebase(), env, log, now: () => t0 });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: 'plantit', firestore: 'ok', identification: 'demo', care: 'bundled', photos: 'unconfigured' });
    expect(res.body.spend.plantnet).toMatchObject({ count: 0, limit: 50 });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('returns 503 with firestore: error when Firestore is unreachable', async () => {
    const app = createApp({ firebase: fakeFirebase({ failDb: true }), env, log, now: () => t0 });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, service: 'plantit', firestore: 'error' });
  });
});

describe('auth', () => {
  test('protected routes need a valid Firebase ID token', async () => {
    const app = createApp({ firebase: fakeFirebase(), env, log, now: () => t0 });
    expect((await request(app).get('/api/plants')).status).toBe(401);
    expect((await request(app).get('/api/plants').set('Authorization', 'Bearer nope')).status).toBe(401);
    expect((await request(app).get('/api/plants').set('Authorization', 'Bearer good')).status).toBe(200);
  });
});

describe('identify (demo path) and the simulated device', () => {
  test('a photo is identified from the bundled list, saved, and reads as a simulated sensor', async () => {
    const firebase = fakeFirebase();
    const clock = { now: t0 };
    const app = createApp({ firebase, env, log, now: () => clock.now });
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n'), Buffer.alloc(20000, 7)]);

    const ident = await request(app).post('/api/identify').set('Authorization', 'Bearer good').attach('image', png, { filename: 'leaf.png', contentType: 'image/png' });
    expect(ident.status).toBe(200);
    expect(ident.body.demo).toBe(true);
    expect(ident.body.reason).toBe('no_plantnet_key');
    expect(ident.body.candidates[0].species.scientificNameWithoutAuthor).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    expect(ident.body.careInstructions.watering).toBeTruthy();
    expect(ident.body.savedPlant.sensorMode).toBe('simulated');
    const id = ident.body.savedPlant.id;
    expect(firebase.rtdbWrites[0][1]).toBe(`plants/u1/${id}`);

    const list = await request(app).get('/api/plants').set('Authorization', 'Bearer good');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].createdAt).toBe('2026-09-18T12:00:00.000Z');

    const fresh = await request(app).get(`/api/plants/${id}/device`).set('Authorization', 'Bearer good');
    expect(fresh.body.mode).toBe('simulated');
    expect(fresh.body.reading.label).toBe('Simulated sensor');
    expect(fresh.body.reading.currentVWC).toBe(fresh.body.reading.maxVWC);
    expect(fresh.body.events).toEqual([]);

    clock.now = t0 + 70 * 3600 * 1000;
    const dry = await request(app).get(`/api/plants/${id}/device`).set('Authorization', 'Bearer good');
    expect(dry.body.reading.needsWater).toBe(true);

    const watered = await request(app).post(`/api/plants/${id}/water`).set('Authorization', 'Bearer good');
    expect(watered.status).toBe(200);
    expect(watered.body.event).toMatchObject({ type: 'watered', source: 'simulated', vwcBefore: dry.body.reading.currentVWC });
    expect(watered.body.reading.currentVWC).toBe(watered.body.reading.maxVWC);
    expect(watered.body.events).toHaveLength(1);
    expect(firebase.rtdbWrites.some(([op, p]) => op === 'update' && p === `plants/u1/${id}`)).toBe(true);
  });

  test('once an ESP8266 has reported, the plant switches to hardware mode', async () => {
    const firebase = fakeFirebase();
    const app = createApp({ firebase, env, log, now: () => t0 });
    await firebase.db.collection('users').doc('u1').collection('plants').doc('p1').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20 });
    const report = await request(app).post('/api/plants/p1/moisture').send({ userId: 'u1', currentVWC: 33.5 });
    expect(report.status).toBe(200);
    const dev = await request(app).get('/api/plants/p1/device').set('Authorization', 'Bearer good');
    expect(dev.body.mode).toBe('hardware');
    expect(dev.body.reading).toMatchObject({ source: 'device', currentVWC: 33.5, needsWater: false });
  });

  test('rejects uploads that are not images and unknown API routes', async () => {
    const app = createApp({ firebase: fakeFirebase(), env, log, now: () => t0 });
    const bad = await request(app).post('/api/identify').set('Authorization', 'Bearer good').attach('image', Buffer.alloc(20000, 1), { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

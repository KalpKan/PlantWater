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
    async recursiveDelete(ref) { for (const p of [...store.keys()]) if (p === ref.path || p.startsWith(`${ref.path}/`)) store.delete(p); },
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

  test('once a connected ESP8266 has reported with its device secret, the plant switches to hardware mode', async () => {
    const firebase = fakeFirebase();
    const app = createApp({ firebase, env, log, now: () => t0 });
    await firebase.db.collection('users').doc('u1').collection('plants').doc('p1').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20, deviceConnected: true, deviceSecret: 's3cret' });
    const report = await request(app).post('/api/plants/p1/moisture').set('X-Device-Secret', 's3cret').send({ userId: 'u1', currentVWC: 33.5 });
    expect(report.status).toBe(200);
    const dev = await request(app).get('/api/plants/p1/device').set('Authorization', 'Bearer good');
    expect(dev.body.mode).toBe('hardware');
    expect(dev.body.reading).toMatchObject({ source: 'device', currentVWC: 33.5, needsWater: false });
    const targets = await request(app).get('/api/plants/p1/moisture/u1').set('X-Device-Secret', 's3cret');
    expect(targets.status).toBe(200);
    expect(targets.body).toMatchObject({ minVWC: 15, maxVWC: 45, currentVWC: 33.5 });
  });

  test('firmware routes reject a plant that was never connected, a missing secret, and a wrong secret', async () => {
    const firebase = fakeFirebase();
    const app = createApp({ firebase, env, log, now: () => t0 });
    const plants = firebase.db.collection('users').doc('u1').collection('plants');
    await plants.doc('never').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20, currentVWC: 45 });
    await plants.doc('p1').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20, currentVWC: 45, deviceConnected: true, deviceSecret: 's3cret' });

    // Someone holding only a uid + plantId (both visible in a public photo URL) cannot flip a plant to hardware mode.
    expect((await request(app).post('/api/plants/never/moisture').send({ userId: 'u1', currentVWC: 1, watered: true })).status).toBe(403);
    expect((await request(app).post('/api/plants/p1/moisture').send({ userId: 'u1', currentVWC: 1, watered: true })).status).toBe(403);
    expect((await request(app).post('/api/plants/p1/moisture').set('X-Device-Secret', 'wrong').send({ userId: 'u1', currentVWC: 1, watered: true })).status).toBe(403);
    expect((await request(app).get('/api/plants/p1/moisture/u1')).status).toBe(403);
    expect((await request(app).get('/api/plants/p1/moisture/u1').set('X-Device-Secret', 'wrong')).status).toBe(403);
    // Unknown plant with any secret: still 403, never a 404 that would confirm the pair exists.
    expect((await request(app).get('/api/plants/ghost/moisture/u1').set('X-Device-Secret', 'x')).status).toBe(403);

    // Nothing was written: the plant is still simulated, VWC untouched, no fake "device" watering event.
    const dev = await request(app).get('/api/plants/p1/device').set('Authorization', 'Bearer good');
    expect(dev.body.mode).toBe('simulated');
    expect(dev.body.events).toEqual([]);
    expect((await plants.doc('p1').get()).data().currentVWC).toBe(45);
    expect(firebase.rtdbWrites).toEqual([]);
  });

  test('Water now in hardware mode logs a manual event and leaves the live reading to the device', async () => {
    const firebase = fakeFirebase();
    const app = createApp({ firebase, env, log, now: () => t0 });
    const ref = firebase.db.collection('users').doc('u1').collection('plants').doc('p1');
    await ref.set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20, currentVWC: 18.5, deviceConnected: true, deviceSecret: 's', deviceReportedAt: { toMillis: () => t0 - 60000 } });
    const res = await request(app).post('/api/plants/p1/water').set('Authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('hardware');
    expect(res.body.event).toMatchObject({ type: 'watered', source: 'manual', vwcBefore: 18.5 });
    expect(res.body.event.vwcAfter).toBeUndefined();
    // The sensor value is not fabricated: it stays at the device's last report until the ESP8266 reports again.
    expect(res.body.reading).toMatchObject({ source: 'device', currentVWC: 18.5, pendingDeviceReport: true });
    expect(res.body.reading.lastWatered).toBe('2026-09-18T12:00:00.000Z');
    expect((await ref.get()).data().currentVWC).toBe(18.5);
    const rt = firebase.rtdbWrites.find(([op, p]) => op === 'update' && p === 'plants/u1/p1');
    expect(rt[2]).toEqual({ lastWatered: '2026-09-18T12:00:00.000Z' });
  });

  test('the "waiting for the sensor" flag survives a reload and clears on the next device report', async () => {
    const firebase = fakeFirebase();
    const app = createApp({ firebase, env, log, now: () => t0 });
    const ref = firebase.db.collection('users').doc('u1').collection('plants').doc('p1');
    await ref.set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20, currentVWC: 18.5, deviceConnected: true, deviceSecret: 's', deviceReportedAt: { toMillis: () => t0 - 60000 } });
    await request(app).post('/api/plants/p1/water').set('Authorization', 'Bearer good');
    // Persisted on the plant doc, so a fresh GET (a page reload) still shows the note.
    expect((await ref.get()).data().pendingDeviceReport).toBe(true);
    const dev = await request(app).get('/api/plants/p1/device').set('Authorization', 'Bearer good');
    expect(dev.body.reading).toMatchObject({ source: 'device', currentVWC: 18.5, pendingDeviceReport: true });
    const list = await request(app).get('/api/plants').set('Authorization', 'Bearer good');
    expect(list.body[0].pendingDeviceReport).toBe(true);
    // The device's next report owns the reading again.
    const report = await request(app).post('/api/plants/p1/moisture').set('X-Device-Secret', 's').send({ userId: 'u1', currentVWC: 41 });
    expect(report.status).toBe(200);
    expect((await ref.get()).data().pendingDeviceReport).toBe(false);
    const after = await request(app).get('/api/plants/p1/device').set('Authorization', 'Bearer good');
    expect(after.body.reading.currentVWC).toBe(41);
    expect(after.body.reading.pendingDeviceReport).toBe(false);
    // A simulated plant never carries the flag.
    await firebase.db.collection('users').doc('u1').collection('plants').doc('p2').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20 });
    const sim = await request(app).post('/api/plants/p2/water').set('Authorization', 'Bearer good');
    expect(sim.body.reading.pendingDeviceReport).toBeUndefined();
    expect((await firebase.db.collection('users').doc('u1').collection('plants').doc('p2').get()).data().pendingDeviceReport).toBeUndefined();
  });

  test('rejects uploads that are not images and unknown API routes', async () => {
    const app = createApp({ firebase: fakeFirebase(), env, log, now: () => t0 });
    const bad = await request(app).post('/api/identify').set('Authorization', 'Bearer good').attach('image', Buffer.alloc(20000, 1), { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

describe('delete plant', () => {
  test('removes the plant, its events subcollection, and the RTDB mirror', async () => {
    const firebase = fakeFirebase();
    const app = createApp({ firebase, env, log, now: () => t0 });
    await firebase.db.collection('users').doc('u1').collection('plants').doc('p1').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, wateringThreshold: 20 });
    await request(app).post('/api/plants/p1/water').set('Authorization', 'Bearer good');
    expect([...firebase.db.store.keys()].filter((k) => k.startsWith('users/u1/plants/p1/events/'))).toHaveLength(1);

    const res = await request(app).delete('/api/plants/p1').set('Authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect([...firebase.db.store.keys()].filter((k) => k.startsWith('users/u1/plants/p1'))).toHaveLength(0);
    expect(firebase.rtdbWrites).toContainEqual(['remove', 'plants/u1/p1']);
    expect((await request(app).delete('/api/plants/p1').set('Authorization', 'Bearer good')).status).toBe(404);
  });
});

describe('connect-device (hardware required)', () => {
  const seed = async (firebase) => firebase.db.collection('users').doc('u1').collection('plants').doc('p1').set({ species: 'Ficus lyrata', minVWC: 15, maxVWC: 45, optimalVWC: 30 });

  test('rejects public IPs, malformed ports and path injection before any network call', async () => {
    const firebase = fakeFirebase();
    const posts = [];
    const app = createApp({ firebase, env, log, now: () => t0, http: { post: async (url, body) => { posts.push([url, body]); return { data: {} }; } } });
    await seed(firebase);
    const send = (body) => request(app).post('/api/plants/p1/connect-device').set('Authorization', 'Bearer good').send(body);
    expect((await send({ deviceIP: '8.8.8.8', devicePort: 8080 })).status).toBe(400);
    expect((await send({ deviceIP: '169.254.169.254', devicePort: 80 })).status).toBe(400); // cloud metadata endpoint
    expect((await send({ deviceIP: '192.168.1.50', devicePort: '80/x' })).status).toBe(400);
    expect((await send({ deviceIP: '192.168.1.50', devicePort: 70000 })).status).toBe(400);
    expect((await send({ deviceIP: '192.168.1.50', devicePort: 0 })).status).toBe(400);
    expect((await send({ deviceIP: '192.168.1.999', devicePort: 8080 })).status).toBe(400);
    expect((await send({ deviceIP: 'localhost', devicePort: 8080 })).status).toBe(400);
    expect(posts).toEqual([]);
  });

  test('configures a device on the home network, issues a per-plant secret and stores the validated port', async () => {
    const firebase = fakeFirebase();
    const posts = [];
    const app = createApp({ firebase, env, log, now: () => t0, http: { post: async (url, body) => { posts.push([url, body]); return { data: {} }; } } });
    await seed(firebase);
    const res = await request(app).post('/api/plants/p1/connect-device').set('Authorization', 'Bearer good').send({ deviceIP: '10.0.0.7', devicePort: '8080' });
    expect(res.status).toBe(200);
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('http://10.0.0.7:8080/configure');
    expect(posts[0][1]).toMatchObject({ minVWC: 15, maxVWC: 45, optimalVWC: 30, userId: 'u1', plantId: 'p1' });
    expect(posts[0][1].deviceSecret).toMatch(/^[0-9a-f]{32}$/);
    const saved = (await firebase.db.collection('users').doc('u1').collection('plants').doc('p1').get()).data();
    expect(saved).toMatchObject({ deviceConnected: true, deviceIP: '10.0.0.7', devicePort: 8080, deviceSecret: posts[0][1].deviceSecret });
    // The secret is only for the device: it never comes back through the signed-in API.
    expect(res.body.deviceSecret).toBeUndefined();
    const list = await request(app).get('/api/plants').set('Authorization', 'Bearer good');
    expect(list.body[0].deviceSecret).toBeUndefined();
    // ...and the device can now report with it.
    expect((await request(app).post('/api/plants/p1/moisture').set('X-Device-Secret', posts[0][1].deviceSecret).send({ userId: 'u1', currentVWC: 30 })).status).toBe(200);
  });

  test('on Vercel it answers hardwareRequired 502 without contacting anything', async () => {
    const firebase = fakeFirebase();
    const posts = [];
    const app = createApp({ firebase, env: { ...env, VERCEL: '1' }, log, now: () => t0, http: { post: async (url) => { posts.push(url); return { data: {} }; } } });
    await seed(firebase);
    const res = await request(app).post('/api/plants/p1/connect-device').set('Authorization', 'Bearer good').send({ deviceIP: '192.168.1.50', devicePort: 8080 });
    expect(res.status).toBe(502);
    expect(res.body.hardwareRequired).toBe(true);
    expect(posts).toEqual([]);
  });
});

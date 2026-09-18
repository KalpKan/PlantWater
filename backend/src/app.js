/**
 * Plant It API (Express). Exported as a plain app so it can run as one Vercel
 * serverless function (api/index.js) or locally (backend/src/index.js).
 *
 * createApp(deps) lets tests inject a fake Firebase; production uses the real
 * lazily-initialised Admin SDK from ./firebase.js.
 */
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const { getFirebase, isConfigured: firebaseConfigured } = require('./firebase');
const storage = require('./storage');
const providers = require('./providers');
const { SpendGuard } = require('./spendGuard');
const { simulateReading, waterPlant, deviceHasReported } = require('./simulatedDevice');

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // Vercel's request body limit
const MIN_UPLOAD_BYTES = 10 * 1024;

function toMs(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'object' && (v.seconds !== undefined || v._seconds !== undefined)) return Number(v.seconds ?? v._seconds) * 1000;
  return new Date(v).getTime();
}
function toIso(v) {
  const ms = toMs(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
/** True for RFC1918 / link-local / loopback IPv4 only: the ESP8266 lives on a home network, never the public internet. */
function isPrivateIPv4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ''));
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  if (o[0] === 10) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  return false;
}
function parsePort(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 65535 ? n : null;
}
function secretsMatch(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function serializePlant(id, data) {
  const { deviceSecret, ...rest } = data; // the per-plant device secret only ever goes to the ESP8266
  return {
    ...rest,
    id,
    createdAt: toIso(data.createdAt),
    lastWatered: toIso(data.lastWatered),
    deviceReportedAt: toIso(data.deviceReportedAt),
    connectedAt: toIso(data.connectedAt),
    sensorMode: deviceHasReported(data) ? 'hardware' : 'simulated',
  };
}

/** Resize + JPEG-encode with sharp when it is available; otherwise pass the bytes through. */
async function normaliseImage(buffer, log) {
  try {
    const sharp = require('sharp');
    return await sharp(buffer).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, progressive: true }).toBuffer();
  } catch (error) {
    log.warn('sharp unavailable or failed, sending the original bytes:', error.message);
    return buffer;
  }
}

function imageProcessor() {
  try { require('sharp'); return 'sharp'; } catch (e) { return 'none'; }
}

function createApp(deps = {}) {
  const log = deps.log || console;
  const now = deps.now || (() => Date.now());
  const env = deps.env || process.env;
  const fb = () => deps.firebase || getFirebase(env);
  const photos = deps.storage || storage;
  const prov = deps.providers || providers;
  const http = deps.http || axios;
  const guards = {};
  const guardFor = (service, limitVar) => {
    if (!guards[service]) guards[service] = new SpendGuard({ db: fb().db, service, limit: env[limitVar] });
    return guards[service];
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  const allowed = new Set([
    'http://localhost:3000',
    ...String(env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  ]);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '1mb' }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // ---- auth -----------------------------------------------------------------
  const authenticate = async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first' });
      req.user = await fb().auth.verifyIdToken(header.slice(7));
      return next();
    } catch (error) {
      if (/not configured/.test(error.message)) return res.status(503).json({ error: 'Sign-in service unavailable', details: error.message });
      return res.status(401).json({ error: 'Invalid or expired sign-in token' });
    }
  };
  const plantsRef = (uid) => fb().db.collection('users').doc(uid).collection('plants');
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---- health ---------------------------------------------------------------
  app.get('/api/health', asyncRoute(async (req, res) => {
    const body = {
      ok: true,
      service: 'plantit',
      firestore: 'error',
      photos: photos.isConfigured(env) ? 'supabase' : 'unconfigured',
      identification: env.PLANTNET_API_KEY ? 'plantnet' : 'demo',
      care: env.OPENAI_API_KEY ? 'openai' : 'bundled',
      image: imageProcessor(),
      time: new Date(now()).toISOString(),
    };
    if (firebaseConfigured(env) || deps.firebase) {
      try {
        let timer;
        const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('firestore timeout')), 6000); });
        try {
          await Promise.race([fb().db.collection('spend').doc('health').get(), timeout]);
        } finally {
          clearTimeout(timer);
        }
        body.firestore = 'ok';
        body.spend = {
          plantnet: await guardFor('plantnet', 'PLANTNET_DAILY_LIMIT').status(),
          openai: await guardFor('openai', 'OPENAI_DAILY_LIMIT').status(),
        };
      } catch (error) {
        body.firestoreError = error.message;
      }
    } else {
      body.firestoreError = 'Firebase Admin not configured';
    }
    body.ok = body.firestore === 'ok';
    res.set('Cache-Control', 'no-store').status(body.ok ? 200 : 503).json(body);
  }));

  // ---- identification -------------------------------------------------------
  app.post('/api/identify', authenticate, upload.single('image'), asyncRoute(async (req, res) => {
    const uid = req.user.uid;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Attach one image as the "image" field' });
    if (!/^image\//.test(file.mimetype || '')) return res.status(400).json({ error: 'Only image files are accepted' });
    if (file.size < MIN_UPLOAD_BYTES) return res.status(400).json({ error: 'That image is too small to identify (minimum 10 KB)' });

    const jpeg = await normaliseImage(file.buffer, log);
    const ident = await prov.identify({ buffer: jpeg, guard: guardFor('plantnet', 'PLANTNET_DAILY_LIMIT'), log });
    const top = ident.candidates[0];
    const species = top.species.scientificNameWithoutAuthor;
    const guide = await prov.careGuide({ species, guard: guardFor('openai', 'OPENAI_DAILY_LIMIT'), log });
    const care = guide.care;

    const ref = plantsRef(uid).doc();
    let imageUrl = null;
    let photoPath = null;
    if (photos.isConfigured(env)) {
      try {
        const up = await photos.uploadPhoto({ buffer: jpeg, path: `${uid}/${ref.id}.jpg`, contentType: 'image/jpeg' });
        imageUrl = up.publicUrl;
        photoPath = up.path;
      } catch (error) {
        log.error('Photo upload failed, saving the plant without a photo:', error.message);
      }
    }

    const { Timestamp } = fb();
    const nowMs = now();
    const plant = {
      id: ref.id,
      species,
      commonName: (top.species.commonNames && top.species.commonNames[0]) || 'Unknown',
      family: (top.species.family && top.species.family.scientificNameWithoutAuthor) || 'Unknown',
      confidence: top.score,
      demo: ident.demo,
      identificationSource: ident.demo ? 'demo' : 'plantnet',
      careSource: guide.source,
      imageUrl,
      photoPath,
      careInstructions: care,
      minVWC: care.soilMoisture.minVWC,
      maxVWC: care.soilMoisture.maxVWC,
      optimalVWC: care.soilMoisture.optimalVWC,
      wateringThreshold: care.soilMoisture.wateringThreshold,
      currentVWC: care.soilMoisture.maxVWC,
      createdAt: Timestamp.fromMillis(nowMs),
      lastWatered: Timestamp.fromMillis(nowMs),
      deviceConnected: false,
    };
    await ref.set(plant);
    try {
      await fb().rtdb.ref(`plants/${uid}/${ref.id}`).set({
        minVWC: plant.minVWC, maxVWC: plant.maxVWC, optimalVWC: plant.optimalVWC, wateringThreshold: plant.wateringThreshold,
        currentVWC: plant.currentVWC, lastWatered: new Date(nowMs).toISOString(), species, commonName: plant.commonName,
      });
    } catch (error) {
      log.error('Realtime Database write failed (plant still saved in Firestore):', error.message);
    }

    res.json({
      candidates: ident.candidates,
      demo: ident.demo,
      reason: ident.reason || null,
      careInstructions: care,
      careSource: guide.source,
      savedPlant: serializePlant(ref.id, plant),
    });
  }));

  app.get('/api/plant/:species/care', authenticate, asyncRoute(async (req, res) => {
    const guide = await prov.careGuide({ species: req.params.species, guard: guardFor('openai', 'OPENAI_DAILY_LIMIT'), log });
    res.json({ ...guide.care, source: guide.source });
  }));

  // ---- plants ---------------------------------------------------------------
  app.get('/api/plants', authenticate, asyncRoute(async (req, res) => {
    const snap = await plantsRef(req.user.uid).get();
    const plants = snap.docs.map((d) => serializePlant(d.id, d.data()));
    plants.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json(plants);
  }));

  app.delete('/api/plants/:plantId', authenticate, asyncRoute(async (req, res) => {
    const uid = req.user.uid;
    const ref = plantsRef(uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const data = doc.data();
    // Firestore never cascades: recursiveDelete also clears the plant's `events` subcollection.
    await fb().db.recursiveDelete(ref);
    try { await fb().rtdb.ref(`plants/${uid}/${req.params.plantId}`).remove(); } catch (e) { log.error('RTDB delete failed:', e.message); }
    if (data.photoPath && photos.isConfigured(env)) {
      try { await photos.deletePhoto(data.photoPath); } catch (e) { log.error('Photo delete failed:', e.message); }
    }
    res.json({ success: true });
  }));

  // ---- sensor: simulated unless a real ESP8266 has reported --------------------
  const readingFor = (plantId, data) => {
    if (deviceHasReported(data)) {
      return {
        source: 'device', label: 'Live sensor (ESP8266)',
        currentVWC: Number(data.currentVWC) || 0,
        needsWater: (Number(data.currentVWC) || 0) <= (Number(data.wateringThreshold) || 20),
        lastWatered: toIso(data.lastWatered), deviceReportedAt: toIso(data.deviceReportedAt), deviceIP: data.deviceIP || null,
        minVWC: data.minVWC, maxVWC: data.maxVWC, optimalVWC: data.optimalVWC, wateringThreshold: data.wateringThreshold,
      };
    }
    return simulateReading({
      plantId, lastWateredMs: toMs(data.lastWatered), nowMs: now(),
      minVWC: data.minVWC, maxVWC: data.maxVWC, optimalVWC: data.optimalVWC, wateringThreshold: data.wateringThreshold,
    });
  };
  const recentEvents = async (ref) => {
    const snap = await ref.collection('events').orderBy('at', 'desc').limit(10).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  app.get('/api/plants/:plantId/device', authenticate, asyncRoute(async (req, res) => {
    const ref = plantsRef(req.user.uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const data = doc.data();
    const mode = deviceHasReported(data) ? 'hardware' : 'simulated';
    res.set('Cache-Control', 'no-store').json({ mode, reading: readingFor(doc.id, data), events: await recentEvents(ref) });
  }));

  app.post('/api/plants/:plantId/water', authenticate, asyncRoute(async (req, res) => {
    const uid = req.user.uid;
    const ref = plantsRef(uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const data = doc.data();
    const mode = deviceHasReported(data) ? 'hardware' : 'simulated';
    const before = readingFor(doc.id, data);
    const w = waterPlant({ nowMs: now(), maxVWC: data.maxVWC });
    const { Timestamp } = fb();
    let event;
    let update;
    let rt;
    if (mode === 'hardware') {
      // A real sensor owns currentVWC: log the manual watering and wait for the device's next report.
      event = { type: 'watered', source: 'manual', at: w.lastWatered, vwcBefore: before.currentVWC };
      update = { lastWatered: Timestamp.fromMillis(w.lastWateredMs) };
      rt = { lastWatered: w.lastWatered };
    } else {
      event = { type: 'watered', source: 'simulated', at: w.lastWatered, vwcBefore: before.currentVWC, vwcAfter: w.currentVWC };
      update = { lastWatered: Timestamp.fromMillis(w.lastWateredMs), currentVWC: w.currentVWC };
      rt = { lastWatered: w.lastWatered, currentVWC: w.currentVWC };
    }
    await ref.update(update);
    await ref.collection('events').add(event);
    try { await fb().rtdb.ref(`plants/${uid}/${doc.id}`).update(rt); } catch (e) { log.error('RTDB update failed:', e.message); }
    const after = { ...data, ...update };
    const reading = readingFor(doc.id, after);
    if (mode === 'hardware') reading.pendingDeviceReport = true;
    res.json({ ok: true, mode, event, reading, events: await recentEvents(ref) });
  }));

  // ---- routes the ESP8266 firmware calls (hardware required) ------------------
  // Both routes are unauthenticated (the firmware has no Google account), so they
  // require the per-plant secret that connect-device issued and sent to the
  // device, in an X-Device-Secret header. A uid + plantId pair on its own (visible
  // in every public photo URL) must not be enough to flip a plant to hardware mode.
  const DEVICE_DENIED = { error: 'Device not authorised for this plant', hardwareRequired: true, details: 'Connect the ESP8266 from the app first; it then sends the X-Device-Secret header it was given.' };
  const loadDevicePlant = async (req, uid, plantId) => {
    const ref = plantsRef(String(uid)).doc(String(plantId));
    const doc = await ref.get();
    const data = doc.exists ? doc.data() : null;
    const ok = Boolean(data && data.deviceConnected === true && secretsMatch(req.get('x-device-secret'), data.deviceSecret));
    return ok ? { ref, doc, data } : null;
  };

  app.post('/api/plants/:plantId/moisture', asyncRoute(async (req, res) => {
    const { currentVWC, userId, watered = false } = req.body || {};
    const vwc = Number(currentVWC);
    if (!userId || !Number.isFinite(vwc) || vwc < 0 || vwc > 100) return res.status(400).json({ error: 'Body needs userId and currentVWC (0-100)' });
    const found = await loadDevicePlant(req, userId, req.params.plantId);
    if (!found) return res.status(403).json(DEVICE_DENIED);
    const { ref } = found;
    const { Timestamp } = fb();
    const nowMs = now();
    const update = { currentVWC: vwc, deviceReportedAt: Timestamp.fromMillis(nowMs) };
    if (watered) update.lastWatered = Timestamp.fromMillis(nowMs);
    await ref.update(update);
    if (watered) await ref.collection('events').add({ type: 'watered', source: 'device', at: new Date(nowMs).toISOString(), vwcAfter: vwc });
    try {
      const rt = { currentVWC: vwc, deviceReportedAt: new Date(nowMs).toISOString() };
      if (watered) rt.lastWatered = new Date(nowMs).toISOString();
      await fb().rtdb.ref(`plants/${userId}/${req.params.plantId}`).update(rt);
    } catch (e) { log.error('RTDB update failed:', e.message); }
    res.json({ success: true, currentVWC: vwc });
  }));

  app.get('/api/plants/:plantId/moisture/:userId', asyncRoute(async (req, res) => {
    const found = await loadDevicePlant(req, req.params.userId, req.params.plantId);
    if (!found) return res.status(403).json(DEVICE_DENIED);
    const d = found.data;
    res.json({
      minVWC: d.minVWC, maxVWC: d.maxVWC, optimalVWC: d.optimalVWC, wateringThreshold: d.wateringThreshold,
      currentVWC: d.currentVWC || 0, lastWatered: toIso(d.lastWatered), species: d.species, commonName: d.commonName,
    });
  }));

  const HARDWARE_UNREACHABLE = {
    error: 'Could not reach the ESP8266',
    hardwareRequired: true,
    details: 'This needs a real device on the same network as the API. On the hosted app the API runs in Vercel\'s cloud, so run the API locally (npm run dev:api) to connect hardware.',
  };

  app.post('/api/plants/:plantId/connect-device', authenticate, asyncRoute(async (req, res) => {
    const { deviceIP, devicePort = 8080 } = req.body || {};
    const ip = String(deviceIP || '').trim();
    const port = parsePort(devicePort);
    // Home-network addresses only: the function must never be pointed at a public host or the cloud metadata IP.
    if (!isPrivateIPv4(ip)) return res.status(400).json({ error: 'deviceIP must be a private IPv4 address on your home network (10.x.x.x, 172.16-31.x.x or 192.168.x.x)' });
    if (!port) return res.status(400).json({ error: 'devicePort must be a whole number from 1 to 65535' });
    // The hosted API cannot see a home Wi-Fi, so do not even try from Vercel.
    if (env.VERCEL) return res.status(502).json(HARDWARE_UNREACHABLE);
    const uid = req.user.uid;
    const ref = plantsRef(uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const d = doc.data();
    // Fresh secret on every connect; the device must send it back as X-Device-Secret on the moisture routes.
    const deviceSecret = crypto.randomBytes(16).toString('hex');
    const payload = { minVWC: d.minVWC || 15, maxVWC: d.maxVWC || 45, optimalVWC: d.optimalVWC || 30, userId: uid, plantId: doc.id, deviceSecret };
    try {
      await http.post(`http://${ip}:${port}/configure`, payload, { timeout: 4000 });
    } catch (error) {
      return res.status(502).json(HARDWARE_UNREACHABLE);
    }
    const { Timestamp } = fb();
    await ref.update({ deviceConnected: true, deviceIP: ip, devicePort: port, deviceSecret, connectedAt: Timestamp.fromMillis(now()) });
    const { deviceSecret: _omit, ...moistureValues } = payload;
    res.json({ success: true, deviceIP: ip, devicePort: port, moistureValues });
  }));

  app.post('/api/plants/:plantId/disconnect-device', authenticate, asyncRoute(async (req, res) => {
    const ref = plantsRef(req.user.uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const { FieldValue } = fb();
    await ref.update({ deviceConnected: false, deviceIP: FieldValue.delete(), devicePort: FieldValue.delete(), deviceSecret: FieldValue.delete(), connectedAt: FieldValue.delete(), deviceReportedAt: FieldValue.delete() });
    res.json({ success: true });
  }));

  app.get('/api/discover-devices', authenticate, asyncRoute(async (req, res) => {
    const subnet = env.DEVICE_DISCOVERY_SUBNET; // e.g. "192.168.86." ; only meaningful when the API runs on the home network
    if (!subnet) {
      return res.json({ devices: [], hardwareRequired: true, message: 'Device discovery only works when the API runs on your home network (npm run dev:api with DEVICE_DISCOVERY_SUBNET set). Enter the ESP8266 IP by hand instead.' });
    }
    const probes = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}${i}`;
      probes.push(axios.get(`http://${ip}:8080/status`, { timeout: 600 }).then(() => ({ ip, port: 8080, name: 'Plant Watering Device' })).catch(() => null));
    }
    const devices = (await Promise.all(probes)).filter(Boolean);
    res.json({ devices, hardwareRequired: true, message: `Found ${devices.length} device(s)` });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: `No route ${req.method} ${req.originalUrl}` }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Image too large: keep it under 4.5 MB' });
    log.error('Unhandled error:', error);
    const status = /not configured/.test(error && error.message) ? 503 : 500;
    res.status(status).json({ error: status === 503 ? 'Service not configured' : 'Something went wrong', details: error && error.message });
  });

  return app;
}

module.exports = { createApp, serializePlant, toMs, isPrivateIPv4, parsePort };

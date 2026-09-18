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
function serializePlant(id, data) {
  return {
    ...data,
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
    await ref.delete();
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
    const event = { type: 'watered', source: mode === 'hardware' ? 'manual' : 'simulated', at: w.lastWatered, vwcBefore: before.currentVWC, vwcAfter: w.currentVWC };
    await ref.update({ lastWatered: Timestamp.fromMillis(w.lastWateredMs), currentVWC: w.currentVWC });
    await ref.collection('events').add(event);
    try { await fb().rtdb.ref(`plants/${uid}/${doc.id}`).update({ lastWatered: w.lastWatered, currentVWC: w.currentVWC }); } catch (e) { log.error('RTDB update failed:', e.message); }
    const after = { ...data, lastWatered: Timestamp.fromMillis(w.lastWateredMs), currentVWC: w.currentVWC };
    res.json({ ok: true, mode, event, reading: readingFor(doc.id, after), events: await recentEvents(ref) });
  }));

  // ---- routes the ESP8266 firmware calls (hardware required) ------------------
  app.post('/api/plants/:plantId/moisture', asyncRoute(async (req, res) => {
    const { currentVWC, userId, watered = false } = req.body || {};
    const vwc = Number(currentVWC);
    if (!userId || !Number.isFinite(vwc) || vwc < 0 || vwc > 100) return res.status(400).json({ error: 'Body needs userId and currentVWC (0-100)' });
    const ref = plantsRef(String(userId)).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
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
    const doc = await plantsRef(req.params.userId).doc(req.params.plantId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const d = doc.data();
    res.json({
      minVWC: d.minVWC, maxVWC: d.maxVWC, optimalVWC: d.optimalVWC, wateringThreshold: d.wateringThreshold,
      currentVWC: d.currentVWC || 0, lastWatered: toIso(d.lastWatered), species: d.species, commonName: d.commonName,
    });
  }));

  app.post('/api/plants/:plantId/connect-device', authenticate, asyncRoute(async (req, res) => {
    const { deviceIP, devicePort = 8080 } = req.body || {};
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(deviceIP || ''))) return res.status(400).json({ error: 'deviceIP must be an IPv4 address' });
    const uid = req.user.uid;
    const ref = plantsRef(uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const d = doc.data();
    const payload = { minVWC: d.minVWC || 15, maxVWC: d.maxVWC || 45, optimalVWC: d.optimalVWC || 30, userId: uid, plantId: doc.id };
    try {
      await axios.post(`http://${deviceIP}:${devicePort}/configure`, payload, { timeout: 4000 });
    } catch (error) {
      return res.status(502).json({
        error: 'Could not reach the ESP8266',
        hardwareRequired: true,
        details: 'This needs a real device on the same network as the API. On the hosted app the API runs in Vercel\'s cloud, so run the API locally (npm run dev:api) to connect hardware.',
      });
    }
    const { Timestamp } = fb();
    await ref.update({ deviceConnected: true, deviceIP, devicePort, connectedAt: Timestamp.fromMillis(now()) });
    res.json({ success: true, deviceIP, moistureValues: payload });
  }));

  app.post('/api/plants/:plantId/disconnect-device', authenticate, asyncRoute(async (req, res) => {
    const ref = plantsRef(req.user.uid).doc(req.params.plantId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
    const { FieldValue } = fb();
    await ref.update({ deviceConnected: false, deviceIP: FieldValue.delete(), devicePort: FieldValue.delete(), connectedAt: FieldValue.delete(), deviceReportedAt: FieldValue.delete() });
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

module.exports = { createApp, serializePlant, toMs };

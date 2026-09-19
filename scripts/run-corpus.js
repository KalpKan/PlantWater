#!/usr/bin/env node
/**
 * Run the identification corpus (tests/fixtures/plants) against a Plant It API
 * and score it against ground-truth.json and its bars.
 *
 *   set -a; source ~/.config/portfolio-ops/secrets.env; set +a   # FIREBASE_* for the throwaway sign-in
 *   node scripts/run-corpus.js --base https://plantit.kalpkan.com [--uid corpus-test] [--keep] [--openai-key sk-...] [--only mug,dracaena,zamioculcas]
 *
 * --only <comma list> runs just the fixtures whose file name contains one of the
 * words (plus the free negatives), for a cheap spot check when the day's
 * Pl@ntNet budget is short; the per-bar "of" counts shrink accordingly and the
 * summary says the run was partial.
 *
 * How it signs in: Firebase Admin (service account from FIREBASE_PROJECT_ID /
 * FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) mints a custom token for a
 * throwaway uid, which the public Identity Toolkit endpoint exchanges for an
 * ID token using the app's PUBLIC web API key (the same one shipped in
 * frontend/src/firebase.js). The service account comes from the FIREBASE_*
 * variables or from ~/.config/portfolio-ops/plantit-firebase-sa.json
 * (FIREBASE_SERVICE_ACCOUNT_FILE overrides). Alternatively pass PLANTIT_ID_TOKEN
 * in the environment (copied from a browser session) and no Admin credentials are needed.
 * Nothing secret is ever printed. Plants created by the run are deleted at the
 * end unless --keep is given. Budget: one Pl@ntNet call per plant photo (15).
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const BASE = (opt('--base', 'https://plantit.kalpkan.com') || '').replace(/\/$/, '');
const UID = opt('--uid', 'corpus-test');
const KEEP = args.includes('--keep');
const OPENAI_KEY = opt('--openai-key', '');
const ONLY = String(opt('--only', '') || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
const WEB_API_KEY = process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyCL08dLFchZWMR5YbxNarVgmQoPWZIMQUE'; // public, see frontend/src/firebase.js
const DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'plants');
const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'ground-truth.json'), 'utf8'));

const SA_FILE = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || path.join(process.env.HOME || '', '.config', 'portfolio-ops', 'plantit-firebase-sa.json');

/** Firebase Admin auth from the FIREBASE_* variables or, failing that, the operator's service-account JSON copy. */
function adminAuth() {
  const { getFirebase, isConfigured } = require('../backend/src/firebase');
  if (isConfigured()) return getFirebase().auth;
  if (fs.existsSync(SA_FILE)) {
    const admin = require('firebase-admin');
    const sa = JSON.parse(fs.readFileSync(SA_FILE, 'utf8'));
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(sa) });
    return admin.auth(app);
  }
  throw new Error(`Set PLANTIT_ID_TOKEN, or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY, or put the service-account JSON at ${SA_FILE} (FIREBASE_SERVICE_ACCOUNT_FILE overrides)`);
}

async function idToken() {
  if (process.env.PLANTIT_ID_TOKEN) return process.env.PLANTIT_ID_TOKEN;
  const custom = await adminAuth().createCustomToken(UID);
  const res = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`, { token: custom, returnSecureToken: true }, { timeout: 15000 });
  return res.data.idToken;
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const genusOf = (name) => String(name || '').split(' ')[0];

async function main() {
  const token = await idToken();
  const auth = { Authorization: `Bearer ${token}`, ...(OPENAI_KEY ? { 'X-OpenAI-Key': OPENAI_KEY } : {}) };
  const health = await axios.get(`${BASE}/api/health`, { timeout: 15000, validateStatus: () => true });
  console.log(`API ${BASE}: health ${health.status} identification=${health.data.identification} care=${health.data.care} plantnet today=${health.data.spend && health.data.spend.plantnet ? health.data.spend.plantnet.count : '?'}`);
  if (health.data.identification !== 'plantnet') console.log('WARNING: identification is not "plantnet"; species bars cannot be met in demo mode.');

  const rows = [];
  const created = [];
  const items = ONLY.length
    ? truth.items.filter((it) => it.difficulty === 'negative' || ONLY.some((w) => it.file.toLowerCase().includes(w)))
    : truth.items;
  if (ONLY.length) console.log(`PARTIAL RUN (--only ${ONLY.join(',')}): ${items.length} of ${truth.items.length} fixtures; the bars below are scaled to this subset.`);
  for (const item of items) {
    const file = path.join(DIR, item.file);
    const form = new FormData();
    form.append('image', fs.readFileSync(file), { filename: item.file, contentType: item.file.endsWith('.txt') ? 'text/plain' : 'image/jpeg' });
    const t0 = Date.now();
    let res;
    try {
      res = await axios.post(`${BASE}/api/identify`, form, { headers: { ...auth, ...form.getHeaders() }, timeout: 60000, validateStatus: () => true, maxBodyLength: Infinity });
    } catch (e) {
      res = { status: 0, data: { error: e.message } };
    }
    const ms = Date.now() - t0;
    const body = res.data || {};
    const cands = Array.isArray(body.candidates) ? body.candidates : [];
    const top1 = cands[0] ? cands[0].species.scientificNameWithoutAuthor : null;
    const score = cands[0] ? cands[0].score : null;
    const negative = item.difficulty === 'negative';
    const genusOk = !negative && asList(item.genus).includes(genusOf(top1));
    const speciesOk = !negative && item.species.includes(top1);
    const top3Ok = !negative && cands.slice(0, 3).some((c) => item.species.includes(c.species.scientificNameWithoutAuthor));
    if (body.savedPlant && body.savedPlant.id) created.push(body.savedPlant.id);
    let negativeOk = null;
    if (negative) {
      // Expected: a 4xx that names the problem and no plant saved. A 200 with demo: true is the wrong answer (a mug becomes a Ficus).
      negativeOk = res.status >= 400 && res.status < 500 && !body.savedPlant;
    }
    // Care bar (D2): the guide that came back must sit inside the species' careBar from ground-truth.json.
    const care = body.careInstructions || null;
    const threshold = care && care.soilMoisture ? care.soilMoisture.wateringThreshold : null;
    let careOk = null;
    if (!negative && item.careBar && res.status === 200) {
      const b = item.careBar;
      careOk = care !== null
        && (b.wateringThresholdMax === undefined || threshold <= b.wateringThresholdMax)
        && (b.wateringThresholdMin === undefined || threshold >= b.wateringThresholdMin)
        && (!b.wateringMustMatch || new RegExp(b.wateringMustMatch, 'i').test(String(care.watering)));
    }
    // Low-confidence bar (D3): the API flags a top-1 score under 0.3 so the page can warn and list the runner-ups.
    const lowOk = !negative && res.status === 200 && score !== null && body.demo !== true ? body.lowConfidence === (score < 0.3) : null;
    rows.push({ file: item.file, status: res.status, ms, top1, score: score === null ? null : Math.round(score * 100) / 100, demo: body.demo === true, careSource: body.careSource || null, wateringThreshold: threshold, lowConfidence: body.lowConfidence === true, nCandidates: cands.length, genusOk, speciesOk, top3Ok, negativeOk, careOk, lowOk, expected: negative ? 'not a plant / refused' : item.species.join(' | '), error: body.error || null });
    const flag = negative ? (negativeOk ? 'ok' : 'WRONG') : `${genusOk ? 'genus' : '-----'} ${speciesOk ? 'species' : '-------'} ${top3Ok ? 'top3' : '----'} ${careOk === null ? '    ' : careOk ? 'care' : 'CARE!'} ${lowOk === false ? 'LOWCONF!' : body.lowConfidence ? 'lowconf' : ''}`;
    console.log(`${item.file.padEnd(28)} ${String(res.status).padStart(3)} ${String(ms).padStart(5)} ms  ${String(top1 || body.error || '').padEnd(28)} ${score === null ? '    ' : String(Math.round(score * 100)).padStart(3) + '%'} ${body.demo ? 'DEMO ' : '     '} ${threshold === null ? '   ' : ('t' + threshold).padStart(3)} ${flag}`);
  }

  const plants = rows.filter((r) => r.negativeOk === null);
  const n = plants.length;
  const count = (k) => plants.filter((r) => r[k]).length;
  const slow = rows.filter((r) => r.ms >= 10000).length;
  const negatives = rows.filter((r) => r.negativeOk !== null);
  const cared = rows.filter((r) => r.careOk !== null);
  const lows = rows.filter((r) => r.lowOk !== null);
  // Scale the count bars when --only shrank the set (13/15 -> the same fraction of what ran).
  const scaled = (k, of) => Math.ceil((k / 15) * of);
  const results = [
    [`genus top-1 >= ${scaled(13, n)}/${n}`, count('genusOk'), n, count('genusOk') >= scaled(13, n)],
    [`species top-1 >= ${scaled(9, n)}/${n}`, count('speciesOk'), n, count('speciesOk') >= scaled(9, n)],
    [`species in top-3 >= ${scaled(13, n)}/${n}`, count('top3Ok'), n, count('top3Ok') >= scaled(13, n)],
    ['every identify < 10 s', rows.length - slow, rows.length, slow === 0],
    ['negatives refused, nothing saved', negatives.filter((r) => r.negativeOk).length, negatives.length, negatives.every((r) => r.negativeOk)],
    ['care guide inside the species careBar (dry-out / moist)', cared.filter((r) => r.careOk).length, cared.length, cared.every((r) => r.careOk)],
    ['lowConfidence flag == (score < 0.3)', lows.filter((r) => r.lowOk).length, lows.length, lows.every((r) => r.lowOk)],
  ];
  console.log('\nBars:');
  for (const [name, got, of, ok] of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${got}/${of}`);
  const out = { base: BASE, ranAt: new Date().toISOString(), partial: ONLY.length ? ONLY : null, rows, bars: results.map(([name, got, of, ok]) => ({ name, got, of, ok })) };
  const outFile = path.join(process.env.CORPUS_OUT || '/tmp', `plantit-corpus-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Results written to ${outFile}`);

  if (!KEEP) {
    for (const id of created) {
      await axios.delete(`${BASE}/api/plants/${id}`, { headers: auth, timeout: 30000, validateStatus: () => true });
    }
    console.log(`Deleted ${created.length} plant(s) created by this run (uid ${UID}).`);
  } else {
    console.log(`Kept ${created.length} plant(s) under uid ${UID}.`);
  }
  process.exit(results.every((r) => r[3]) ? 0 : 1);
}

main().catch((e) => { console.error('run-corpus failed:', e.message); process.exit(2); });

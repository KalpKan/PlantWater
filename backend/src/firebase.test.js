/**
 * The Admin wrapper must hand app.js everything it destructures from fb():
 * db, rtdb, auth, FieldValue and Timestamp. Production broke on 2026-09-18
 * because Timestamp was missing (identify/water threw "reading 'fromMillis'").
 */
jest.mock('firebase-admin', () => {
  const firestore = () => ({ collection: jest.fn() });
  firestore.FieldValue = { serverTimestamp: jest.fn() };
  firestore.Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms }) };
  return {
    apps: [],
    initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
    app: jest.fn(),
    credential: { cert: jest.fn((c) => c) },
    firestore,
    database: () => ({ ref: jest.fn() }),
    auth: () => ({ verifyIdToken: jest.fn() }),
  };
});

const { getFirebase, isConfigured } = require('./firebase');

const env = {
  FIREBASE_PROJECT_ID: 'demo-project',
  FIREBASE_CLIENT_EMAIL: 'sa@demo-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
};

test('isConfigured needs all three env names', () => {
  expect(isConfigured({})).toBe(false);
  expect(isConfigured({ ...env, FIREBASE_PRIVATE_KEY: '' })).toBe(false);
  expect(isConfigured(env)).toBe(true);
});

test('getFirebase exposes db, rtdb, auth, FieldValue and Timestamp', () => {
  const fb = getFirebase(env);
  expect(fb.db).toBeDefined();
  expect(fb.rtdb).toBeDefined();
  expect(fb.auth).toBeDefined();
  expect(fb.FieldValue).toBeDefined();
  expect(typeof fb.Timestamp.fromMillis).toBe('function');
  expect(fb.Timestamp.fromMillis(1000).toMillis()).toBe(1000);
});

test('the private key is passed with real newlines', () => {
  const admin = require('firebase-admin');
  const cert = admin.credential.cert.mock.calls[0][0];
  expect(cert.privateKey).toContain('\n');
  expect(cert.privateKey).not.toContain('\\n');
});

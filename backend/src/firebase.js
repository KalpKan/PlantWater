/**
 * Firebase Admin, initialised lazily from three env vars (see .env.example):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * The private key may be pasted with real newlines or with literal "\n".
 * Project plant-it-5e2fc stays on the Spark plan: Firestore, Realtime
 * Database and Auth only. Firebase Storage is NOT used (photos go to Supabase).
 */
const admin = require('firebase-admin');

let cached = null;

function isConfigured(env = process.env) {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

function getFirebase(env = process.env) {
  if (cached) return cached;
  if (!isConfigured(env)) {
    throw new Error('Firebase Admin is not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
  }
  const projectId = env.FIREBASE_PROJECT_ID;
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
    });
  cached = {
    admin,
    app,
    db: admin.firestore(app),
    rtdb: admin.database(app),
    auth: admin.auth(app),
    FieldValue: admin.firestore.FieldValue,
  };
  return cached;
}

module.exports = { getFirebase, isConfigured };

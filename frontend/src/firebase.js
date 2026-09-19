import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';

// Firebase web config is public by design (it identifies the project; access
// is controlled by Firebase Auth and the security rules in firebase/).
// Project plant-it-5e2fc stays on the free Spark plan: Auth + Firestore + RTDB.
// Plant photos are NOT in Firebase Storage; the API stores them in Supabase.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyCL08dLFchZWMR5YbxNarVgmQoPWZIMQUE',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'plant-it-5e2fc.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'plant-it-5e2fc',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '332296587444',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:332296587444:web:d808db1024148c29d82fe1',
};

const app = initializeApp(firebaseConfig);
// initializeAuth without a popupRedirectResolver: getAuth() would load Google's
// sign-in iframe (~95 KB) on every page view to check for a pending redirect.
// Login.js passes browserPopupRedirectResolver to signInWithPopup instead, so the
// iframe loads only when the button is clicked (TEST round 1 D6). The persistence
// order is getAuth()'s default, so existing sessions keep working.
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
export default app;

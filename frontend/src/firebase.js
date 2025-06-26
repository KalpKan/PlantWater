import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCL08dLFchZWMR5YbxNarVgmQoPWZIMQUE",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "plant-it-5e2fc.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "plant-it-5e2fc",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "plant-it-5e2fc.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "332296587444",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:332296587444:web:d808db1024148c29d82fe1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app; 
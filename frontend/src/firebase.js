import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCL08dLFchZWMR5YbxNarVgmQoPWZIMQUE",
  authDomain: "plant-it-5e2fc.firebaseapp.com",
  projectId: "plant-it-5e2fc",
  storageBucket: "plant-it-5e2fc.firebasestorage.app",
  messagingSenderId: "332296587444",
  appId: "1:332296587444:web:d808db1024148c29d82fe1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app; 
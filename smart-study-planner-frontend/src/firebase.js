import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

const firestoreDatabaseId =
  import.meta.env.VITE_FIRESTORE_DATABASE_ID || "smart-study";
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;

// TEMP: unconditional — confirm env in both dev and prod, then restore DEV-only guard
console.log("MODE:", import.meta.env.MODE);
console.log("DEV:", import.meta.env.DEV);
console.log("PROD:", import.meta.env.PROD);
console.log("Firestore DB:", import.meta.env.VITE_FIRESTORE_DATABASE_ID);
console.log("Storage bucket:", import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
console.log(`[firebase] → using Firestore database: ${firestoreDatabaseId}`);
console.log(`[firebase] → using Storage bucket: ${storageBucket}`);

export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const storage = getStorage(app, `gs://${storageBucket}`);
export default app;

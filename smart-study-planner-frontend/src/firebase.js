import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA7mXSBmMDTOFWS9UHdIlCh12RXdnptx7s",
  authDomain: "dev-sarina.firebaseapp.com",
  projectId: "dev-sarina",
  storageBucket: "dev-sarina.firebasestorage.app",
  messagingSenderId: "957894061134",
  appId: "1:957894061134:web:384afd6eb88a91ce12a71f",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, "smart_study");
export default app;

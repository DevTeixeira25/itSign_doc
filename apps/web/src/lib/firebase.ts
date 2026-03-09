import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "REMOVED_API_KEY",
  authDomain: "itsign-79d36.firebaseapp.com",
  projectId: "itsign-79d36",
  storageBucket: "itsign-79d36.firebasestorage.app",
  messagingSenderId: "727349596425",
  appId: "1:727349596425:web:3c76720fd67978782c03d8",
  measurementId: "G-YP5PQ1XW3N",
};

// Prevent re-initialization in Next.js hot-reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export default app;

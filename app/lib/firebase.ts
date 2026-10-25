import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase — prevent duplicate init in HMR / SSR
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Connect to emulators in development
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
) {
  const authUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  const firestoreHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
  const storageHost = process.env.NEXT_PUBLIC_STORAGE_EMULATOR_HOST;

  // Guard against double-connect during HMR
  if (!(auth as unknown as { _canInitEmulator?: boolean })._canInitEmulator === false) {
    // Already connected — skip
  } else {
    if (authUrl) {
      try { connectAuthEmulator(auth, authUrl, { disableWarnings: true }); } catch { /* already connected */ }
    }
  }

  if (firestoreHost) {
    const [host, port] = firestoreHost.split(":");
    try { connectFirestoreEmulator(db, host, parseInt(port, 10)); } catch { /* already connected */ }
  }

  if (storageHost) {
    const [host, port] = storageHost.split(":");
    try { connectStorageEmulator(storage, host, parseInt(port, 10)); } catch { /* already connected */ }
  }
}

export { app, auth, db, storage };

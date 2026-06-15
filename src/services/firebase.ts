/**
 * src/services/firebase.ts
 *
 * Firebase initialization engine — singleton pattern.
 * Import `db`, `auth`, `storage`, or `analytics` from here
 * in any module hook or service file.
 *
 * DO NOT call initializeApp() anywhere else in the codebase.
 * DO NOT import directly from "firebase/app" in component files.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore }                    from "firebase/firestore";
import { getAuth }                         from "firebase/auth";
import { getStorage }                      from "firebase/storage";
import { getAnalytics, isSupported }       from "firebase/analytics";

// ─── Firebase Project Configuration ───────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCW-g385o-RT7GE_z-Q0FpMz9P5HR4LUuo",
  authDomain:        "sti-sync.firebaseapp.com",
  projectId:         "sti-sync",
  storageBucket:     "sti-sync.firebasestorage.app",
  messagingSenderId: "821083100323",
  appId:             "1:821083100323:web:b18bb485a6df1bb5d31b16",
  measurementId:     "G-51X2P4CQV7",
};

// ─── App Singleton ─────────────────────────────────────────────────────────────
// Guards against double-initialization in React strict mode / hot module reloads.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ─── Service Instances ─────────────────────────────────────────────────────────

/** Firestore database — use in all module hooks and services */
export const db = getFirestore(app);

/** Firebase Authentication */
export const auth = getAuth(app);

/** Firebase Storage — for event cover images, documents, certificate templates */
export const storage = getStorage(app);

/**
 * Firebase Analytics — conditionally initialized.
 * Analytics requires a browser environment (not SSR / Node).
 * Resolved as a Promise<Analytics | null> to handle unsupported environments gracefully.
 */
export const analyticsPromise = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

export default app;

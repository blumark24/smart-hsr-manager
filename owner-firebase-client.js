// Shared Firebase bootstrap for the Owner Command Center surface
// (owner.html + owner-login.html only). Manager/inspector/contractor pages
// each initialize their own, separately-named Firebase app instance and are
// not affected by this module.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { resolveFirebaseConfig } from './firebase-runtime-config.js';

// Owner must use the exact same Firebase project as the current deployment.
// Production aliases resolve to the production project; every Vercel Preview
// resolves to the locked staging project through /api/firebase-config.
// This prevents Preview owner ID tokens from being rejected by Preview APIs.
const firebaseConfig = await resolveFirebaseConfig();

export const app = initializeApp(firebaseConfig, 'smart-hsr-owner-session');
export const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
export const db = getFirestore(app);

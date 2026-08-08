// Shared Firebase bootstrap for the Owner Command Center surface
// (owner.html + owner-login.html only). Manager/inspector/contractor pages
// each initialize their own, separately-named Firebase app instance and are
// not affected by this module.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCXCiNeaO9lhM79tKb98x4oaNqNy5xKvWM",
  authDomain: "smart-hsr-manager.firebaseapp.com",
  projectId: "smart-hsr-manager",
  storageBucket: "smart-hsr-manager.firebasestorage.app",
  messagingSenderId: "38965508031",
  appId: "1:38965508031:web:6fd0b6c6b0b63fa513930a"
};

export const app = initializeApp(firebaseConfig, 'smart-hsr-owner-session');
export const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
export const db = getFirestore(app);

const PRODUCTION_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyCXCiNeaO9lhM79tKb98x4oaNqNy5xKvWM',
  authDomain: 'smart-hsr-manager.firebaseapp.com',
  projectId: 'smart-hsr-manager',
  storageBucket: 'smart-hsr-manager.firebasestorage.app',
  messagingSenderId: '38965508031',
  appId: '1:38965508031:web:6fd0b6c6b0b63fa513930a'
});

const PRODUCTION_HOSTNAMES = Object.freeze([
  'smart-hsr-manager.vercel.app',
  'smart-hsr-manager-blumark24-os.vercel.app',
  'smart.blumark24.com'
]);

export async function resolveFirebaseConfig() {
  const hostname = String(location.hostname || '').toLowerCase();
  // Fail closed on all unknown hosts, including Render and future custom domains.
  // Production is never inferred from "not a Vercel preview".
  if (PRODUCTION_HOSTNAMES.includes(hostname)) {
    return PRODUCTION_FIREBASE_CONFIG;
  }
  const response = await fetch('/api/firebase-config', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('FIREBASE_PREVIEW_CONFIG_UNAVAILABLE');
  const config = await response.json();
  if (config?.projectId !== 'smart-hsr-staging-blumark24') throw new Error('FIREBASE_PREVIEW_PROJECT_DENIED');
  return Object.freeze(config);
}

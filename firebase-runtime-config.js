const PRODUCTION_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyCXCiNeaO9lhM79tKb98x4oaNqNy5xKvWM',
  authDomain: 'smart-hsr-manager.firebaseapp.com',
  projectId: 'smart-hsr-manager',
  storageBucket: 'smart-hsr-manager.firebasestorage.app',
  messagingSenderId: '38965508031',
  appId: '1:38965508031:web:6fd0b6c6b0b63fa513930a'
});

export async function resolveFirebaseConfig() {
  if (!location.hostname.endsWith('.vercel.app')) return PRODUCTION_FIREBASE_CONFIG;
  const response = await fetch('/api/firebase-config', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('FIREBASE_PREVIEW_CONFIG_UNAVAILABLE');
  const config = await response.json();
  if (config?.projectId !== 'smart-hsr-staging-blumark24') throw new Error('FIREBASE_PREVIEW_PROJECT_DENIED');
  return Object.freeze(config);
}

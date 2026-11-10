'use strict';
// ============================================================================
// Firebase Admin bootstrap (server-side only).
//
// Firebase Admin v14 removed the legacy namespace API. This module therefore
// uses the modular Admin SDK entry points while preserving SMART HSR's existing
// local contract: getAuth(), getDb(), FieldValue and getAdmin().
//
// Credentials are NEVER hard-coded. They come from the environment:
//   - FIREBASE_SERVICE_ACCOUNT : JSON string of a service account key, OR
//   - GOOGLE_APPLICATION_CREDENTIALS : path to a key file (applicationDefault)
//
// When the Firebase emulators are running, the Admin SDK auto-detects
// FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST and needs no real
// credentials, so local tests never touch live Firebase.
// ============================================================================
const {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} = require('firebase-admin/app');
const { getAuth: getFirebaseAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

let app = null;

function initAdmin() {
  if (app) return app;

  const apps = getApps();
  if (apps.length) {
    app = apps[0];
    return app;
  }

  const usingEmulator =
    !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    'smart-hsr-manager';

  if (usingEmulator) {
    app = initializeApp({ projectId });
    return app;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    }
    app = initializeApp({
      credential: cert(parsed),
      projectId: parsed.project_id || projectId,
    });
    return app;
  }

  app = initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  return app;
}

// Compatibility surface retained for any internal caller that still expects
// the old getAdmin().auth()/firestore() shape. No legacy namespace dependency.
function getAdmin() {
  const activeApp = initAdmin();
  return {
    app: activeApp,
    auth: () => getFirebaseAuth(activeApp),
    firestore: () => getFirestore(activeApp),
  };
}

function getAuth() {
  return getFirebaseAuth(initAdmin());
}

function getDb() {
  return getFirestore(initAdmin());
}

module.exports = { getAdmin, getAuth, getDb, FieldValue };

'use strict';
// ============================================================================
// Firebase Admin bootstrap (server-side only).
//
// Credentials are NEVER hard-coded. They come from the environment:
//   - FIREBASE_SERVICE_ACCOUNT : JSON string of a service account key, OR
//   - GOOGLE_APPLICATION_CREDENTIALS : path to a key file (applicationDefault)
//
// When the Firebase emulators are running, the Admin SDK auto-detects
//   FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST and needs no
//   real credentials — so local tests never touch live Firebase.
// ============================================================================
const admin = require('firebase-admin');

let app = null;

function initAdmin() {
  if (app) return app;
  if (admin.apps.length) { app = admin.apps[0]; return app; }

  const usingEmulator =
    !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    'smart-hsr-manager';

  if (usingEmulator) {
    // Emulator mode: no credentials required.
    app = admin.initializeApp({ projectId });
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
    app = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      projectId: parsed.project_id || projectId,
    });
    return app;
  }

  // Falls back to GOOGLE_APPLICATION_CREDENTIALS / platform default identity.
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
  return app;
}

function getAdmin() {
  initAdmin();
  return admin;
}
function getAuth() {
  return getAdmin().auth();
}
function getDb() {
  return getAdmin().firestore();
}

module.exports = { getAdmin, getAuth, getDb, FieldValue: admin.firestore.FieldValue };

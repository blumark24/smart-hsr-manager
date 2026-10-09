'use strict';

const { getAuth, getDb } = require('../_lib/firebaseAdmin');
const WA = require('../../workspace-access.js');

const ALLOWED = new Set(['u6@smart-hsr.local', 'u7@smart-hsr.local']);

module.exports = async function handler(req, res) {
  try {
    if (process.env.VERCEL_ENV !== 'preview') {
      return res.status(404).json({ error: 'not_found' });
    }
    if (process.env.VERCEL_GIT_COMMIT_REF !== 'design/unified-municipal-shell-v1') {
      return res.status(404).json({ error: 'not_found' });
    }
    const token = String((req.query && req.query.token) || '');
    if (!token || token !== process.env.UAT_DIAGNOSTIC_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const email = String((req.query && req.query.email) || '').trim().toLowerCase();
    if (!ALLOWED.has(email)) {
      return res.status(400).json({ error: 'unsupported_account' });
    }

    const auth = getAuth();
    const db = getDb();
    let authUser = null;
    try {
      authUser = await auth.getUserByEmail(email);
    } catch (error) {
      if (error && error.code !== 'auth/user-not-found') throw error;
    }

    if (!authUser) {
      return res.status(200).json({
        email,
        auth: { exists: false, disabled: null },
        firestore: { exists: false },
        resolution: null,
      });
    }

    const snap = await db.collection('users').doc(authUser.uid).get();
    const data = snap.exists ? (snap.data() || {}) : null;
    const resolution = data ? WA.resolveWorkspaces(data) : null;

    return res.status(200).json({
      email,
      uid: authUser.uid,
      auth: { exists: true, disabled: !!authUser.disabled },
      firestore: data ? {
        exists: true,
        active: data.active !== false,
        organizationId: data.organizationId || null,
        role: data.role || null,
        institutionalRole: data.institutionalRole || null,
        administration: data.administration || null,
        department: data.department || null,
        mobilityAccess: data.mobilityAccess || null,
        landsAccess: data.landsAccess || null,
        entitlements: data.entitlements || null,
      } : { exists: false },
      resolution: resolution ? {
        valid: resolution.valid,
        reason: resolution.reason,
        primary: resolution.primary,
        mobilityRole: resolution.mobilityRole,
        capabilities: resolution.capabilities,
        workspaces: resolution.workspaces.map(w => ({
          id: w.id,
          route: w.route,
          primary: w.primary,
          handoff: w.handoff,
        })),
      } : null,
    });
  } catch (error) {
    console.error('[UAT_DIAGNOSTIC]', error);
    return res.status(500).json({ error: 'diagnostic_failed' });
  }
};

'use strict';

const { assertPreviewFirebaseWebResources } = require('./_lib/previewIsolationGuard');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'NOT_FOUND' });
  let config;
  try {
    config = JSON.parse(process.env.FIREBASE_WEB_CONFIG || '');
  } catch {
    return res.status(503).json({ error: 'FIREBASE_PREVIEW_CONFIG_INVALID' });
  }
  if (config?.projectId !== 'smart-hsr-staging-blumark24') {
    return res.status(503).json({ error: 'FIREBASE_PREVIEW_PROJECT_DENIED' });
  }
  // The projectId alone cannot prove the other Firebase resource endpoints
  // are staged. Never return a mixed Preview configuration to browsers.
  try {
    assertPreviewFirebaseWebResources(config);
  } catch (_) {
    return res.status(503).json({ error: 'FIREBASE_PREVIEW_RESOURCE_DENIED' });
  }
  return res.status(200).json(config);
};

'use strict';
const { handleMobilePreviewCors } = require('./_lib/mobileCors');
const mobileReadiness = require('./_lib/mobileReadiness');

module.exports = function handler(req, res) {
  if (String(req.query?.smartHsrRoute || '') === 'mobile-readiness') {
    return mobileReadiness(req, res);
  }

  if (handleMobilePreviewCors(req, res, { methods: ["GET"] })) return;

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
  return res.status(200).json(config);
};

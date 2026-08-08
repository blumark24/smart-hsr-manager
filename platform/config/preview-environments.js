'use strict';

const APPROVED_PREVIEW_HOSTNAMES = Object.freeze([
  'preview-smart-hsr.local',
  'preview-smart-hsr.test',
]);

const APPROVED_STAGING_PROJECT_IDS = Object.freeze([
  'smart-hsr-staging',
]);

module.exports = Object.freeze({ APPROVED_PREVIEW_HOSTNAMES, APPROVED_STAGING_PROJECT_IDS });

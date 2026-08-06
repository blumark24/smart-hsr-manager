'use strict';

const bootstrap = require('../bootstrap/assignment-v2-preview-bootstrap');
const { evaluatePreviewCompatibility } = require('../assignments/preview-compatibility-gate');

globalThis.SmartHSRAssignmentV2PreviewBundle = Object.freeze({
  getAssignmentV2PreviewApi: bootstrap.getAssignmentV2PreviewApi,
  getAssignmentV2PreviewStatus: bootstrap.getAssignmentV2PreviewStatus,
  initializeAssignmentV2Preview: bootstrap.initializeAssignmentV2Preview,
  isAssignmentV2PreviewAvailable: bootstrap.isAssignmentV2PreviewAvailable,
  evaluatePreviewCompatibility,
});

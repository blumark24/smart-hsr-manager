'use strict';

const CATEGORY_DEFINITIONS = Object.freeze([
  ['ASPHALT_POTHOLE','HIGH'], ['ROAD_CRACKING','MEDIUM'], ['GROUND_SUBSIDENCE','HIGH'], ['LEANING_LIGHTING_POLE','CRITICAL'], ['DAMAGED_LIGHTING_POLE','HIGH'],
  ['FALLEN_PALM_TREE','HIGH'], ['FALLEN_TREE','HIGH'], ['CONSTRUCTION_WASTE','MEDIUM'], ['OVERFLOWING_CONTAINER','MEDIUM'], ['WATER_LEAKAGE','HIGH'],
  ['DAMAGED_SIGN','MEDIUM'], ['VISUAL_POLLUTION','LOW'], ['DAMAGED_SIDEWALK','MEDIUM'], ['EXPOSED_ELECTRICAL_CABLE','CRITICAL'], ['OPEN_MANHOLE','CRITICAL'],
  ['ABANDONED_VEHICLE','MEDIUM'], ['DAMAGED_BARRIER','HIGH'], ['ILLEGAL_EXCAVATION','HIGH'], ['UNCLEAR_IMAGE','UNKNOWN'], ['NON_MUNICIPAL_IMAGE','UNKNOWN'],
].map(([categoryCode, severity]) => Object.freeze({ categoryCode, severity })));

const EVALUATION_CASES = Object.freeze(CATEGORY_DEFINITIONS.flatMap((definition, index) => [1, 2].map(variant => {
  const caseId = `vision-${String(index + 1).padStart(2, '0')}-${variant}`;
  return Object.freeze({ caseId, localFixturePath: `test/fixtures/vision-evaluation-assets/${caseId}.jpg`, contentType: 'image/jpeg',
    provenance: Object.freeze({ type: variant === 1 ? 'SYNTHETIC_PLACEHOLDER' : 'PUBLIC_FIXTURE_PLACEHOLDER', autoDownload: false, sourceDocumentRequired: true, licenseReviewRequired: variant === 2, personalDataProhibited: true }) });
})));

const GROUND_TRUTH = Object.freeze(Object.fromEntries(CATEGORY_DEFINITIONS.flatMap((definition, index) => [1, 2].map(variant => {
  const caseId = `vision-${String(index + 1).padStart(2, '0')}-${variant}`;
  return [caseId, Object.freeze({ categoryCode: definition.categoryCode, severity: definition.severity, lowConfidenceExpected: ['UNCLEAR_IMAGE','NON_MUNICIPAL_IMAGE'].includes(definition.categoryCode), municipalIssueExpected: definition.categoryCode !== 'NON_MUNICIPAL_IMAGE' })];
}))));

const PROVENANCE_REQUIREMENTS = Object.freeze({ noAutomaticDownload: true, syntheticOrDocumentedPublicOnly: true, licenseEvidenceBeforeUse: true, personalDataProhibited: true, noFaces: true, noNames: true, noVehiclePlates: true, noOperationalCoordinates: true, checksumBeforeEvaluation: true });

module.exports = Object.freeze({ CATEGORY_DEFINITIONS, EVALUATION_CASES, GROUND_TRUTH, PROVENANCE_REQUIREMENTS });

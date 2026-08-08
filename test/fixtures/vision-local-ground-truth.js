'use strict';

// Ground truth for fixtures under test/fixtures/vision/, keyed by filename.
//
// Empty by design. The only candidate ground truth previously frozen for an
// asphalt-pothole case (evaluation/real-vision/sprint-5e/manifest.json,
// caseId "s5e-asphalt-pothole") has provenance.status "MISSING" and points at
// a different, never-obtained fixture (a .png under
// evaluation/real-vision/sprint-5e/fixtures/, not the .jpg committed at
// test/fixtures/vision/asphalt-pothole.jpg). There is no verified chain of
// custody linking that frozen entry to the fixture actually evaluated, so no
// category/severity/department label is asserted here.
//
// Add an entry only after a municipal reviewer independently labels a fixture
// (not derived from any AI provider output). Shape:
// 'filename.jpg': { categoryCode, severity, expectedDepartmentKeyword, lowConfidenceExpected }

const LOCAL_VISION_GROUND_TRUTH = Object.freeze({});

module.exports = LOCAL_VISION_GROUND_TRUTH;

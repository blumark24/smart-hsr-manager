'use strict';

// Safe example only. Copy values into an approved, separately reviewed
// staging runtime configuration. Never add credentials to this file.
module.exports=Object.freeze({
  environmentName:'smart-hsr-assignment-v2-staging',
  firebaseProjectId:'demo-smart-hsr-staging',
  allowedProjectIds:Object.freeze(['demo-smart-hsr-staging']),
  allowedHostnames:Object.freeze(['preview-smart-hsr.test']),
  emulatorOnly:true,
  assignmentV2Enabled:false,
  candidateRulesFile:'staging/assignment-v2-rules/firestore.rules.phase-1c-candidate',
  candidateRulesHash:'3aa6bcdc6c4659f5f417bcec24fed6f3ec8cda3a724a789c39ad0634406c088a',
  demoDataOnly:true,
  rollbackVersion:'2d36ab1ede72054e1b197a0126502cbbfc49f35e983c2aeeb8fa8d167e8784e7',
});

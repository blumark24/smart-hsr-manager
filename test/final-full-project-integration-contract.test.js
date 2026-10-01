'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const publicEnhancements = read('public-enhancements.js');
const gateway = read('Home.html');
const workforceLogin = read('login.html');
const leadershipLogin = read('manager-login.html');
const managerAdapter = read('manager-dashboard-adapter.js');
const usersApi = read('api/admin/users.js');
const authz = read('api/_lib/authz.js');
const productContract = read('platform/contracts/product-entitlement-contract.js');
const landsContext = read('api/organization/context.js');

test('public site enters SMART HSR only through the hardened gateway', () => {
  assert.match(publicEnhancements, /location\.href\s*=\s*['"]Home\.html['"]/);
  assert.match(gateway, /href="manager-login\.html"/);
  assert.match(gateway, /href="login\.html"/);
  assert.doesNotMatch(gateway, /owner-login\.html/);
  assert.ok(fs.existsSync(path.join(root, 'owner-login.html')), 'owner portal remains separate and present');
});

test('leadership route is isolated, organization-bound, and resolves only to manager workspace', () => {
  assert.match(leadershipLogin, /initializeApp\(firebaseConfig, ['"]smart-hsr-manager-session['"]\)/);
  assert.match(leadershipLogin, /doc\(probeDb, ["']managers["'], probeUser\.uid\)/);
  assert.match(leadershipLogin, /manager\.role !== ['"]manager['"]/);
  assert.match(leadershipLogin, /manager\.active === false/);
  assert.match(leadershipLogin, /!organizationId/);
  assert.match(leadershipLogin, /setLeadershipPortalContext\(probeUser, organizationId\)/);
  assert.match(leadershipLogin, /window\.location\.href = ["']manager\.html["']/);

  assert.match(managerAdapter, /expectedRole = requestedPortal === ['"]workforce['"] \? ['"]supervisor['"] : ['"]manager['"]/);
  assert.match(managerAdapter, /markerOrg === context\.organizationId/);
  assert.match(managerAdapter, /authApi\.signOut\(auth\)/);
  assert.match(managerAdapter, /location\.replace\(portalLoginTarget\(requestedPortal\)\)/);
});

test('canonical workforce router binds institutional path to the real project workspaces', () => {
  assert.match(workforceLogin, /const canonicalFieldPath =/);
  assert.match(workforceLogin, /const canonicalLandsPath =/);
  assert.match(workforceLogin, /const canonicalMobilityPath =/);
  assert.match(workforceLogin, /const canonicalAdministrativePath =/);

  assert.match(workforceLogin, /institutionalRole === ['"]department_head['"]\) window\.location\.href = ['"]department-head\.html['"]/);
  assert.match(workforceLogin, /role === ['"]supervisor['"]\) window\.location\.href = ['"]manager\.html['"]/);
  assert.match(workforceLogin, /role === ['"]contractor['"]\) window\.location\.href = ['"]mobile-map\.html['"]/);
  assert.match(workforceLogin, /window\.location\.href = ['"]dashboard\.html['"]/);
  assert.match(workforceLogin, /window\.location\.href = ['"]department-head\.html\?mode=mobility['"]/);
  assert.match(workforceLogin, /window\.location\.href = ['"]admin-affairs\.html['"]/);

  for (const target of ['department-head.html','manager.html','mobile-map.html','dashboard.html','admin-affairs.html']) {
    assert.ok(fs.existsSync(path.join(root, target)), `missing routed workspace: ${target}`);
  }
});

test('Smart Lands uses trusted one-time handoff rather than credentials in the URL', () => {
  assert.match(workforceLogin, /fetch\(['"]\/api\/organization\/context['"]/);
  assert.match(workforceLogin, /Authorization['"]:\s*['"]Bearer ['"] \+ idToken/);
  assert.match(workforceLogin, /landsUrl\.searchParams\.set\(['"]code['"], handoffCode\)/);
  assert.doesNotMatch(workforceLogin, /searchParams\.set\(['"](?:password|email|token)['"]/i);
  assert.match(landsContext, /code/);
});

test('product roles remain independent from institutional identity', () => {
  assert.match(productContract, /mobilityAccess/);
  assert.match(productContract, /landsAccess/);
  assert.match(productContract, /vehicleEligible/);
  assert.match(authz, /function resolveMobilityRole\(data\)/);
  assert.match(authz, /MOBILITY_MANAGEABLE_ROLES\.includes\(access\.role\)/);
});

test('Gate A mission request is tenant- and department-bound to an eligible active employee', () => {
  const start = usersApi.indexOf("if (action === 'createMissionRequest')");
  const end = usersApi.indexOf("if (action === 'listDepartmentMissions')", start);
  assert.ok(start >= 0 && end > start, 'createMissionRequest block not found');
  const block = usersApi.slice(start, end);

  assert.match(block, /caller\.role !== ['"]department_head['"]/);
  assert.match(block, /employee\.organizationId !== caller\.organizationId/);
  assert.match(block, /cross_organization_denied/);
  assert.match(block, /cleanString\(employee\.department\) !== cleanString\(caller\.department\)/);
  assert.match(block, /cross_department_denied/);
  assert.match(block, /employee\.employmentStatus === ['"]inactive['"]/);
  assert.match(block, /employee\.accountStatus !== ['"]ACTIVE['"]/);
  assert.match(block, /mobility\.enabled !== true \|\| mobility\.role !== ['"]employee['"]/);
  assert.match(block, /mobility\.vehicleEligible !== true/);
  assert.match(block, /organizationId: caller\.organizationId/);
  assert.match(block, /department: caller\.department/);
});

test('Gate A cannot silently reassign an approved mission to a different employee', () => {
  assert.match(usersApi, /approved_employee_mismatch/);
  assert.match(usersApi, /assignedEmployeeUid/);
  assert.match(usersApi, /vehicleEligible/);
});

test('disabled or malformed Mobility entitlement fails closed', () => {
  assert.match(authz, /Object\.prototype\.hasOwnProperty\.call\(data, ['"]mobilityAccess['"]\)/);
  assert.match(authz, /access\.enabled === true/);
  assert.match(authz, /return enabled && MOBILITY_MANAGEABLE_ROLES\.includes\(access\.role\) \? access\.role : null/);
});

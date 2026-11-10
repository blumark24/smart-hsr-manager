'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const storageRead = require('../api/storage/read.js');

const {
  resolveViewerContext,
  keyBelongsToOrganization,
  isFieldSurveyDepartment,
} = storageRead._test;

function docSnapshot(data) {
  return {
    exists: data != null,
    data: () => data || {},
  };
}

function viewerDb({ manager = null, user = null } = {}) {
  return {
    collection(name) {
      return {
        doc() {
          return {
            async get() {
              if (name === 'managers') return docSnapshot(manager);
              if (name === 'users') return docSnapshot(user);
              throw new Error('unexpected_collection');
            },
          };
        },
      };
    },
  };
}

function ownershipDb(records) {
  return {
    collection(name) {
      assert.equal(name, 'observations');
      const filters = {};
      const chain = {
        where(field, op, value) {
          assert.equal(op, '==');
          filters[field] = value;
          return chain;
        },
        limit(value) {
          assert.equal(value, 1);
          return chain;
        },
        async get() {
          const match = records.some(record =>
            Object.entries(filters).every(([field, value]) => record[field] === value)
          );
          return { empty: !match };
        },
      };
      return chain;
    },
  };
}

test('field department vocabulary is explicitly recognized', () => {
  assert.equal(isFieldSurveyDepartment('إدارة الحصر الميداني'), true);
  assert.equal(isFieldSurveyDepartment('Field Survey'), true);
  assert.equal(isFieldSurveyDepartment('إدارة حركة السير'), false);
});

test('active canonical Field department head may resolve same-org evidence viewer context', async () => {
  const viewer = await resolveViewerContext(viewerDb({
    user: {
      active: true,
      organizationId: 'Org-A',
      department: 'إدارة الحصر الميداني',
      role: null,
      mobilityAccess: { enabled: true, role: 'department_head' },
    },
  }), 'head-a');

  assert.deepEqual(viewer, {
    uid: 'head-a',
    role: 'department_head',
    organizationId: 'Org-A',
    department: 'إدارة الحصر الميداني',
  });
});

test('department head outside Field Survey is denied', async () => {
  const viewer = await resolveViewerContext(viewerDb({
    user: {
      active: true,
      organizationId: 'Org-A',
      department: 'إدارة حركة السير',
      mobilityAccess: { enabled: true, role: 'department_head' },
    },
  }), 'head-a');
  assert.equal(viewer, null);
});

test('inactive department head is denied', async () => {
  const viewer = await resolveViewerContext(viewerDb({
    user: {
      active: false,
      organizationId: 'Org-A',
      department: 'إدارة الحصر الميداني',
      mobilityAccess: { enabled: true, role: 'department_head' },
    },
  }), 'head-a');
  assert.equal(viewer, null);
});

test('explicitly disabled canonical mobilityAccess cannot fall back to stale legacy department_head role', async () => {
  const viewer = await resolveViewerContext(viewerDb({
    user: {
      active: true,
      organizationId: 'Org-A',
      department: 'إدارة الحصر الميداني',
      role: 'department_head',
      mobilityAccess: { enabled: false, role: null },
    },
  }), 'head-a');
  assert.equal(viewer, null);
});

test('evidence ownership lookup never widens beyond supplied organizationId', async () => {
  const db = ownershipDb([
    {
      organizationId: 'Org-B',
      imagePath: 'observations/Org-B/before/example.jpg',
    },
  ]);

  assert.equal(
    await keyBelongsToOrganization(
      db,
      'observations/Org-B/before/example.jpg',
      'Org-A'
    ),
    false
  );

  assert.equal(
    await keyBelongsToOrganization(
      db,
      'observations/Org-B/before/example.jpg',
      'Org-B'
    ),
    true
  );
});

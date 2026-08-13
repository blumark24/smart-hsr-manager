'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('manager execution matrix is collapsible and rendered as an accessible table', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

  assert.match(source, /<details class="card workflow-smart-card mt-4" open/);
  assert.match(source, /<summary aria-controls="workflowBoard">/);
  assert.match(source, /class="workflow-matrix"/);
  assert.match(source, /<th>المرحلة<\/th><th>البلاغ<\/th><th>المراقب<\/th>/);
  assert.match(source, /id="workflowTotal"/);
});

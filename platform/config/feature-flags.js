'use strict';

const PLATFORM_ASSIGNMENT_V2 = 'PLATFORM_ASSIGNMENT_V2';
const DEFAULT_FLAGS = Object.freeze({ [PLATFORM_ASSIGNMENT_V2]: false });

function createFeatureFlags(testOverrides = {}) {
  const overrides = { ...testOverrides };
  return Object.freeze({
    isEnabled(name) {
      return Object.prototype.hasOwnProperty.call(overrides, name)
        ? overrides[name] === true
        : DEFAULT_FLAGS[name] === true;
    },
  });
}

module.exports = Object.freeze({ DEFAULT_FLAGS, PLATFORM_ASSIGNMENT_V2, createFeatureFlags });

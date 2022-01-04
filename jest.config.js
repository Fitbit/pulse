'use strict';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: 'src/.*\\.test\\.ts$',
  coverageDirectory: '<rootDir>/coverage',
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!**/*.d.ts'],
};

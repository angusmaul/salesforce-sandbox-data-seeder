const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/*.d.ts',
    '!server/types/**',
    '!server/index.ts' // Exclude main server file from coverage
  ],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/'
  }),
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000, // 30 seconds for AI service tests
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true
};
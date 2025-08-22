import { jest } from '@jest/globals';

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'test-api-key';
process.env.SESSION_SECRET = 'test-secret';
process.env.PORT = '3001';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test utilities
global.mockResponse = (data: any) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }]
});

// Clean up after tests
afterEach(() => {
  jest.clearAllTimers();
});

// Increase timeout for integration tests
jest.setTimeout(30000);

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  // Only log in development mode to avoid noise in tests
  if (process.env.NODE_ENV === 'development') {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});
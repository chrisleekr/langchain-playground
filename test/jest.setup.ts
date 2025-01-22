import { jest } from '@jest/globals';

class RedisMock {
  constructor(_url?: string) {
    // Constructor can accept redis url
  }
  get = jest.fn();
  set = jest.fn();
  del = jest.fn();
  disconnect = jest.fn();
  quit = jest.fn();
}

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: RedisMock,
    Redis: RedisMock
  };
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AwsClientCache, buildAwsClientConfig, AWS_CLIENT_DEFAULTS } from '../clientManager';

describe('AwsClientCache', () => {
  interface MockClient {
    destroy: jest.Mock;
    region: string;
  }

  let cache: AwsClientCache<MockClient>;
  let clientFactory: jest.Mock<(region: string) => MockClient>;

  beforeEach(() => {
    clientFactory = jest.fn((region: string) => ({
      destroy: jest.fn(),
      region,
    }));
    cache = new AwsClientCache(clientFactory);
  });

  describe('when getting a client for a new region', () => {
    let result: MockClient;

    beforeEach(() => {
      result = cache.getClient('us-east-1');
    });

    it('creates a new client', () => {
      expect(clientFactory).toHaveBeenCalledTimes(1);
    });

    it('calls factory with correct region', () => {
      expect(clientFactory).toHaveBeenCalledWith('us-east-1');
    });

    it('returns client with correct region', () => {
      expect(result.region).toStrictEqual('us-east-1');
    });

    it('increases cache size to 1', () => {
      expect(cache.size).toStrictEqual(1);
    });
  });

  describe('when getting a client for an already cached region', () => {
    let firstResult: MockClient;
    let secondResult: MockClient;

    beforeEach(() => {
      firstResult = cache.getClient('us-west-2');
      secondResult = cache.getClient('us-west-2');
    });

    it('creates client only once', () => {
      expect(clientFactory).toHaveBeenCalledTimes(1);
    });

    it('returns the same client instance', () => {
      expect(secondResult).toBe(firstResult);
    });

    it('cache size remains 1', () => {
      expect(cache.size).toStrictEqual(1);
    });
  });

  describe('when getting clients for multiple regions', () => {
    let clients: MockClient[];

    beforeEach(() => {
      clients = ['us-east-1', 'us-west-2', 'eu-west-1'].map(region => cache.getClient(region));
    });

    it('creates a client for each region', () => {
      expect(clientFactory).toHaveBeenCalledTimes(3);
    });

    it('cache size equals number of regions', () => {
      expect(cache.size).toStrictEqual(3);
    });

    it('each client has correct region', () => {
      expect(clients.map(c => c.region)).toStrictEqual(['us-east-1', 'us-west-2', 'eu-west-1']);
    });
  });

  describe('when clearing the cache', () => {
    let clients: MockClient[];

    beforeEach(() => {
      clients = ['us-east-1', 'us-west-2'].map(region => cache.getClient(region));
      cache.clear();
    });

    it('destroys all cached clients', () => {
      expect(clients[0]?.destroy).toHaveBeenCalledTimes(1);
      expect(clients[1]?.destroy).toHaveBeenCalledTimes(1);
    });

    it('cache size becomes 0', () => {
      expect(cache.size).toStrictEqual(0);
    });

    it('creates new client for same region after clear', () => {
      cache.getClient('us-east-1');
      expect(clientFactory).toHaveBeenCalledTimes(3); // 2 before clear + 1 after
    });
  });
});

describe('buildAwsClientConfig', () => {
  describe('when building config for a region', () => {
    let result: ReturnType<typeof buildAwsClientConfig>;

    beforeEach(() => {
      result = buildAwsClientConfig('ap-southeast-2');
    });

    it('includes the correct region', () => {
      expect(result.region).toStrictEqual('ap-southeast-2');
    });

    it('includes credentials provider', () => {
      expect(result.credentials).toBeDefined();
    });

    it('includes default maxAttempts', () => {
      expect(result.maxAttempts).toStrictEqual(AWS_CLIENT_DEFAULTS.MAX_ATTEMPTS);
    });
  });
});

describe('AWS_CLIENT_DEFAULTS', () => {
  it('has MAX_ATTEMPTS set to 3', () => {
    expect(AWS_CLIENT_DEFAULTS.MAX_ATTEMPTS).toStrictEqual(3);
  });
});

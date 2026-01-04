import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';

import { getInvestigateCredentials } from './credentials';

/**
 * Common configuration for AWS SDK clients.
 *
 * Best practices applied:
 * - Retry configuration for transient failures (maxAttempts)
 * - Credential provider for authentication
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/configuring-the-jssdk.html
 */
export interface AwsClientConfig {
  /** AWS region */
  region: string;
  /** Credential provider */
  credentials: AwsCredentialIdentityProvider;
  /** Maximum retry attempts (default: 3) */
  maxAttempts: number;
}

/**
 * Default configuration values for AWS clients.
 */
export const AWS_CLIENT_DEFAULTS = {
  /** Maximum retry attempts for failed requests */
  MAX_ATTEMPTS: 3
} as const;

/**
 * Build common AWS client configuration.
 *
 * @param region - AWS region
 * @returns Client configuration object
 */
export const buildAwsClientConfig = (region: string): AwsClientConfig => ({
  region,
  credentials: getInvestigateCredentials(),
  maxAttempts: AWS_CLIENT_DEFAULTS.MAX_ATTEMPTS
});

/**
 * Generic client cache with cleanup support.
 *
 * Provides a type-safe cache for AWS clients with:
 * - Lazy initialization
 * - Region-based caching
 * - Cleanup for graceful shutdown
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/creating-and-calling-service-objects.html
 */
export class AwsClientCache<T extends { destroy: () => void }> {
  private readonly cache = new Map<string, T>();
  private readonly clientFactory: (region: string) => T;

  /**
   * Create a new client cache.
   *
   * @param clientFactory - Factory function to create new clients
   */
  constructor(clientFactory: (region: string) => T) {
    this.clientFactory = clientFactory;
  }

  /**
   * Get or create a cached client for the given region.
   *
   * @param region - AWS region
   * @returns Cached or newly created client
   */
  getClient(region: string): T {
    const existingClient = this.cache.get(region);
    if (existingClient) {
      return existingClient;
    }

    const newClient = this.clientFactory(region);
    this.cache.set(region, newClient);
    return newClient;
  }

  /**
   * Clear all cached clients and destroy connections.
   *
   * Call this during graceful shutdown to clean up resources.
   * Continues destroying remaining clients even if one fails.
   */
  clear(): void {
    for (const client of this.cache.values()) {
      try {
        client.destroy();
      } catch {
        // Continue destroying remaining clients even if one fails
        // to prevent resource leaks during shutdown
      }
    }
    this.cache.clear();
  }

  /**
   * Get the number of cached clients.
   */
  get size(): number {
    return this.cache.size;
  }
}

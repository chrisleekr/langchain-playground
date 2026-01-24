import config from 'config';
import { Redis } from 'ioredis';

let redisClient: Redis | undefined;

/**
 * Gets a singleton Redis client instance.
 *
 * The client is created on first call and cached for subsequent calls.
 * Use `closeRedisClient()` during graceful shutdown to properly close the connection.
 *
 * @returns A Redis client instance
 */
export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(config.get<string>('redis.url'));
  }
  return redisClient;
};

/**
 * Closes the Redis client connection if one exists.
 *
 * Call this during graceful shutdown to properly release the connection.
 * Safe to call even if no client was created.
 */
export const closeRedisClient = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = undefined;
  }
};

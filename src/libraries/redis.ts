import config from 'config';
import { Redis } from 'ioredis';

let redisClient: Redis;

export const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(config.get('redis.url'));
  }
  return redisClient;
};

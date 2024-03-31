import config from 'config';
import { Redis } from 'ioredis';
import { Logger } from '@/libraries';

export const createRedisClient = (logger: Logger) => {
  logger.info('Creating Redis client...');
  return new Redis(config.get('redis.url'));
};

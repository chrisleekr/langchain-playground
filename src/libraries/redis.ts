import config from 'config';
import { Redis } from 'ioredis';

export const getRedisClient = () => new Redis(config.get('redis.url'));

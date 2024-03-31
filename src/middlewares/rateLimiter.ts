import config from 'config';
import { Request } from 'express';
import { rateLimit } from 'express-rate-limit';

import { logger } from '@/libraries/logger';

const rateLimiter = rateLimit({
  legacyHeaders: true,
  limit: config.get('rateLimit.maxRequests') ?? 20,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  windowMs: 15 * 60 * Number(config.get('rateLimit.windowMs') ?? 1000),
  keyGenerator
});

function keyGenerator(request: Request): string {
  if (!request.ip) {
    logger.warn('Warning: request.ip is missing!');
    return request.socket.remoteAddress as string;
  }

  return request.ip.replace(/:\d+[^:]*$/, '');
}

export default rateLimiter;

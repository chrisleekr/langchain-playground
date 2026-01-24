import pino, { Logger } from 'pino';
import type { FastifyBaseLogger } from 'fastify';

const loggerInstance = pino({
  name: 'langchain-playground',
  level: 'trace'
});

const logger: Logger = loggerInstance;

/**
 * Converts a Fastify logger to a Pino Logger type.
 *
 * Fastify's logger is Pino-based but typed as FastifyBaseLogger.
 * This helper provides a centralized, documented type assertion
 * for use in route handlers.
 *
 * @param log - Fastify's request logger (request.log)
 * @returns The same logger typed as Pino Logger
 */
const getRequestLogger = (log: FastifyBaseLogger): Logger => log as Logger;

// Export pino.Logger (type) and logger (value)
export { logger, getRequestLogger };
export type { Logger };

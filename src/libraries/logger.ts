import pino, { Logger } from 'pino';

const loggerInstance = pino({
  name: 'langchain-playground',
  level: 'trace'
});

const logger: Logger = loggerInstance;

// Export pino.Logger and logger
export { logger, Logger };

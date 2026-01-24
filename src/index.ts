import config from 'config';
import type { App } from '@slack/bolt';
import type { FastifyInstance } from 'fastify';
import { logger } from '@/libraries/logger';
import { clearAllAwsClientCaches } from '@/libraries/aws';
import { closeRedisClient } from '@/libraries/redis';
import { startServerWithFastify } from './serverWithFastify';
import { startServerWithSlack } from './serverWithSlack';

/**
 * Main application entry point.
 * Starts the server in the configured mode (fastify or slack) and
 * sets up graceful shutdown handlers.
 */
const main = async (): Promise<void> => {
  const serverMode = config.get<string>('serverMode');

  let actualStartServer: () => Promise<{ app: FastifyInstance | App }>;
  switch (serverMode) {
    case 'fastify':
      actualStartServer = startServerWithFastify;
      break;
    case 'slack':
      actualStartServer = startServerWithSlack;
      break;
    default:
      throw new Error(`Invalid server mode: ${serverMode}`);
  }

  try {
    const { app } = await actualStartServer();

    const gracefulShutdown = async (): Promise<void> => {
      try {
        // Clean up AWS SDK clients to properly close HTTP connections
        // @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/creating-and-calling-service-objects.html
        logger.info('Cleaning up AWS clients...');
        clearAllAwsClientCaches();

        // Close Redis connection
        logger.info('Closing Redis connection...');
        await closeRedisClient();

        if (serverMode === 'fastify') {
          await (app as FastifyInstance).close();
        } else if (serverMode === 'slack') {
          await (app as App).stop();
        }

        logger.info('Server closed successfully.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error while closing server:');
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
};

main();

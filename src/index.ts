import config from 'config';
import type { App } from '@slack/bolt';
import type { FastifyInstance } from 'fastify';
import { logger } from '@/libraries/logger';
import { startServerWithFastify } from './serverWithFastify';
import { startServerWithSlack } from './serverWithSlack';

(async () => {
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
      throw new Error('Invalid server mode');
  }

  actualStartServer().then(({ app }: { app: FastifyInstance | App }) => {
    const gracefulShutdown = async () => {
      try {
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
  });
})();

import config from 'config';
import { logger } from '@/libraries/logger';
import { app } from './server';

// FIXME: REMOVE
console.log(config);
const startServer = async () => {
  try {
    const address = await app.listen({
      port: config.get('port'),
      host: config.get('host')
    });
    logger.info(`Server mode: ${config.get('mode')}`);
    logger.info(`Server listening at ${address}`);
    return app;
  } catch (err) {
    logger.error({ err }, 'Failed to start server:');
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  try {
    await app.close();
    logger.info('Server closed successfully.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error while closing server:');
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
void startServer();

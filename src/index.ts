import config from 'config';
import { logger } from '@/libraries/logger';
import { app } from './server';

const server = app.listen(config.get('port'), () => {
  logger.info(`Server mode: ${config.get('mode')}`);
  logger.info(`Server running on port ${config.get('port')}...`);
});

const onCloseSignal = () => {
  logger.info('SIGINT received, closing server...');
  server.close(() => {
    logger.info('Server closed successfully.');
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', onCloseSignal);
process.on('SIGTERM', onCloseSignal);

import config from 'config';
import { App } from '@slack/bolt';
import { logger } from './libraries/logger';
import { configureSlackEvent } from './slack';

const startServerWithSlack = async (): Promise<{ app: App }> => {
  try {
    // Initializes your app with your bot token and signing secret
    const app = new App({
      token: config.get('slack.botToken'),
      signingSecret: config.get('slack.signingSecret')
    });

    configureSlackEvent(app);

    await app.start(config.get('port'));

    logger.info(`Server with Slack listening at ${config.get('port')}`);

    return { app };
  } catch (err) {
    logger.error({ err }, 'Failed to start server with Slack:');
    process.exit(1);
  }
};

export { startServerWithSlack };

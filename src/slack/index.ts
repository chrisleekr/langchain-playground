import { App } from '@slack/bolt';
import { eventAppMention } from './event/appMention';

const configureSlackEvent = (app: App) => {
  app.event('app_mention', eventAppMention);
};

export { configureSlackEvent };

import { App } from '@slack/bolt';
import { eventAppMention } from './event/appMention';
import { eventMessage } from './event/message';

const configureSlackEvent = (app: App) => {
  app.event('app_mention', eventAppMention);
  app.event('message', eventMessage);
};

export { configureSlackEvent };

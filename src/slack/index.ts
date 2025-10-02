import { App } from '@slack/bolt';
import { eventAppMention } from './event/appMention';
import { eventMessage } from './event/message';
import { eventCommand } from './event/command';

const configureSlackEvent = (app: App) => {
  app.event('app_mention', eventAppMention);
  app.event('message', eventMessage);

  app.command('/generate-rca', eventCommand);
};

export { configureSlackEvent };

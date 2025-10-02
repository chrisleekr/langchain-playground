import { logger } from '@/libraries';
import { EventCommand } from './command/constants';
import { executeStateGraph } from './command/stateGraph';

/**
 *  Event command
 *  i.e.
 *  command: {
 *    "user_id": "xxxx",
 *    "user_name": "xxx",
 *    "command": "/generate-rca",
 *    "text": "https://xxxxx.slack.com/archives/xxxxx/p1758289828459279",
 *    "api_app_id": "xxxxxx",
 *  }
 * @param param0
 * @returns
 */
const eventCommand = async ({ client, command, ack }: EventCommand) => {
  logger.info({ command }, 'event command');
  ack();
  const result = await executeStateGraph(command, client);

  logger.info({ result }, 'event command result');
};

export { eventCommand };

import type { AllMessageEvents } from '@slack/types';
import { executeStateGraph } from './message/stateGraph';
import { EventMessage, NormalizedMessage } from './message/constants';
import { logger } from '../../libraries';

const normalizeMessage = (event: AllMessageEvents): NormalizedMessage => {
  const { type, subtype, channel, ts } = event;

  const bot_id = 'bot_id' in event ? event.bot_id : undefined;
  const bot_profile = 'bot_profile' in event ? event.bot_profile : undefined;
  const text = 'text' in event ? event.text : undefined;
  const thread_ts = 'thread_ts' in event ? event.thread_ts : undefined;
  const attachments = 'attachments' in event ? event.attachments : undefined;
  const blocks = 'blocks' in event ? event.blocks : undefined;
  const files = 'files' in event ? event.files : undefined;

  const normalizedMessage: NormalizedMessage = {
    type,
    subtype,
    channel,
    channel_type: 'channel',
    ts,
    bot_id,
    bot_profile,
    text,
    thread_ts,
    attachments,
    blocks,
    files
  };

  if (attachments) {
    normalizedMessage.text += attachments.map(attachment => attachment.text).join('\n');
  }
  return normalizedMessage;
};

const canHandleMessage = (event: AllMessageEvents): boolean => {
  if (event.subtype !== undefined) {
    if (event.subtype === 'bot_message') {
      logger.info('Handle bot message');
      return true;
    }
    // Ignore message with subtype because it's changed event
    logger.info('Ignore message with subtype');
    return false;
  }
  return true;
};

const eventMessage = async ({ event, client }: EventMessage) => {
  logger.info({ event }, 'event message');

  if (!canHandleMessage(event)) {
    return;
  }

  const normalizedMessage = normalizeMessage(event);
  const result = await executeStateGraph(normalizedMessage, client);

  logger.info(
    {
      result: {
        ...result,
        client: undefined
      }
    },
    'After invoke event message'
  );
};

export { eventMessage };

import type { WebClient } from '@slack/web-api';
import type { AckFn, RespondFn, SlashCommand, RespondArguments } from '@slack/bolt';
import { Annotation } from '@langchain/langgraph';
import { FormattedMessageElement } from '@/libraries/slack/getThreadReplies';

export interface EventCommand {
  client: WebClient;
  command: SlashCommand;
  respond: RespondFn;
  ack: AckFn<string | RespondArguments>;
}

export const OverallStateAnnotation = Annotation.Root({
  command: Annotation<SlashCommand>,
  client: Annotation<WebClient>,
  intentsToExecute: Annotation<string[]>,
  currentIntentIndex: Annotation<number>,
  executedIntents: Annotation<string[]>,

  threadReplies: Annotation<FormattedMessageElement[]>,
  rca: Annotation<string>
});

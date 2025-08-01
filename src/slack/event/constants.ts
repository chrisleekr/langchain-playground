import type { AllMessageEvents, AppMentionEvent, Block, KnownBlock, MessageAttachment } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import type { SayFn } from '@slack/bolt';
import { Annotation } from '@langchain/langgraph';

export interface EventAppMention {
  event: AppMentionEvent;
  client: WebClient;
  say: SayFn;
}

export interface EventMessage {
  event: AllMessageEvents;
  client: WebClient;
  say: SayFn;
}

// Refer since it does not export the type: node_modules/@slack/types/dist/events/message.d.ts
export type ChannelTypes = 'channel' | 'group' | 'im' | 'mpim' | 'app_home';
export type SupportedMessageType = 'message' | 'app_mention';
export interface NormalizedMessage {
  type: SupportedMessageType;
  subtype?: string;
  channel: string;
  channel_type: ChannelTypes;
  ts: string;
  bot_id?: string | undefined;
  bot_profile?:
    | {
        id: string;
        name: string;
        app_id: string;
        team_id: string;
      }
    | undefined;
  text?: string | undefined;
  thread_ts?: string | undefined;
  attachments?: MessageAttachment[] | undefined;
  blocks?: (KnownBlock | Block)[] | undefined;
  files?:
    | {
        id: string;
        created: number;
        name: string | null;
        title: string | null;
        mimetype: string;
        filetype: string;
      }[]
    | undefined;
}

export const OverallStateAnnotation = Annotation.Root({
  userMessage: Annotation<NormalizedMessage>,
  client: Annotation<WebClient>,
  messageHistory: Annotation<string[]>,
  finalResponse: Annotation<string>,
  intentsToExecute: Annotation<string[]>,
  currentIntentIndex: Annotation<number>,
  executedIntents: Annotation<string[]>,
  getMessageHistoryOutput: Annotation<GetMessageHistoryOutput>,
  mcpToolsOutput: Annotation<McpToolsOutput>,
  intentClassifierOutput: Annotation<IntentClassifierOutput>,
  summarizeThreadOutput: Annotation<SummarizeThreadOutput>,
  translateMessageOutput: Annotation<TranslateMessageOutput>,
  findInformationOutput: Annotation<FindInformationOutput>,
  generalResponseOutput: Annotation<GeneralResponseOutput>
});

export const intentToNodeMap: Record<string, IntentToNodeMap> = {
  translate: {
    node: 'translate',
    description: 'Translate the message to another language for language conversion'
  },
  'find-information': {
    node: 'find-information',
    description: 'Find information for discovering or searching for information'
  },
  summarize: {
    node: 'summarize',
    description: 'Summarize the message for understanding context, events, or content'
  }
};

// Map intent names to node names
export interface IntentToNodeMap {
  node: string;
  description: string;
}

export interface IntentClassifierOutput {
  reasoningOutput: string;
  confidence: number;
  intentsToExecute: string[];
}

export interface GetMessageHistoryOutput {
  reasoningOutput: string;
  numberOfMessagesToGet: number | null;
}

export interface McpToolsOutput {
  useMCPTools: boolean;
  confidence: number;
  reasoningOutput: string;
  suggestedTools: string[];
  mcpToolsResponse: string;
}

export interface SummarizeThreadOutput {
  summary: string;
}

export interface TranslateMessageOutput {
  translatedMessage: string;
}

export interface FindInformationOutput {
  reasoningOutput: string;
  keywords: string[];
  relevantInformation: string[];
  summary: string;
}

export interface GeneralResponseOutput {
  response: string;
}

import type { AppMentionEvent } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import type { SayFn } from '@slack/bolt';
import { Annotation } from '@langchain/langgraph';

export interface EventAppMention {
  event: AppMentionEvent;
  client: WebClient;
  say: SayFn;
}

export const OverallStateAnnotation = Annotation.Root({
  event: Annotation<AppMentionEvent>,
  client: Annotation<WebClient>,
  messageHistory: Annotation<string[]>,
  finalResponse: Annotation<string>,
  intentsToExecute: Annotation<string[]>,
  currentIntentIndex: Annotation<number>,
  executedIntents: Annotation<string[]>,
  getMessageHistoryOutput: Annotation<GetMessageHistoryOutput>,
  intentClassifierOutput: Annotation<IntentClassifierOutput>,
  summariseThreadOutput: Annotation<SummariseThreadOutput>,
  translateMessageOutput: Annotation<TranslateMessageOutput>,
  findInformationFromRagOutput: Annotation<FindInformationFromRagOutput>,
  generalResponseOutput: Annotation<GeneralResponseOutput>
});

export const intentToNodeMap: Record<string, IntentToNodeMap> = {
  'summarise-thread': {
    node: 'summarise-thread',
    description: 'Summarise the message history'
  },
  'translate-message': {
    node: 'translate-message',
    description: 'Translate the last message to another language'
  },
  'find-information': {
    node: 'find-information',
    description: 'Find information'
  }
};

// Map intent names to node names
export interface IntentToNodeMap {
  node: string;
  description: string;
}

export interface IntentClassifierOutput {
  reasoningOutput: string;
  intentsToExecute: string[];
}

export interface GetMessageHistoryOutput {
  reasoningOutput: string;
  numberOfMessagesToGet: number | null;
}

export interface SummariseThreadOutput {
  summary: string;
}

export interface TranslateMessageOutput {
  translatedMessage: string;
}

export interface FindInformationFromRagOutput {
  reasoningOutput: string;
  keywords: string[];
  relevantInformation: string[];
  summary: string;
}

export interface GeneralResponseOutput {
  response: string;
}

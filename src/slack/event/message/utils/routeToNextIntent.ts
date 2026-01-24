/**
 * Conditional router function
 *
 * 1st call:
 *  - currentIndex: -1
 *  - intentsToExecute: ['translate', 'summarize']
 *  - executedIntents: []
 *  - set currentIndex to 0
 *  - return: 'translate'
 *
 * 2nd call:
 *  - currentIndex: 0
 *  - intentsToExecute: ['translate', 'summarize']
 *  - executedIntents: ['translate']
 *  - set currentIndex to 1
 *  - return: 'summarize'
 *
 * 3rd call:
 *  - currentIndex: 1
 *  - intentsToExecute: ['translate', 'summarize']
 *  - executedIntents: ['translate', 'summarize']
 *  - set currentIndex to 2
 *  - return: 'final-response'
 *
 **/

import { logger } from '@/libraries';
import { OverallStateAnnotation, intentToNodeMap } from '../constants';

export const routeToNextIntent = (state: typeof OverallStateAnnotation.State): string => {
  const currentIndex = state.currentIntentIndex ?? 0;
  const intentsToExecute = state.intentsToExecute || [];
  const executedIntents = state.executedIntents || [];

  logger.info({ currentIndex, intentsToExecute, executedIntents }, 'routeToNextIntent request');

  if (currentIndex >= intentsToExecute.length) {
    logger.info('No more intents to execute, route to final-response');
    return 'final-response';
  }

  // eslint-disable-next-line security/detect-object-injection -- Index bounds-checked above
  const nextIntent = intentsToExecute[currentIndex];

  logger.info({ nextIntent, currentIndex }, 'routeToNextIntent response');

  // Special handling for general-response
  if (nextIntent === 'general-response') {
    return 'general-response';
  }

  // eslint-disable-next-line security/detect-object-injection -- Validated with Object.hasOwn
  const nodeMapping = Object.hasOwn(intentToNodeMap, nextIntent) ? intentToNodeMap[nextIntent] : undefined;
  return nodeMapping?.node || 'final-response';
};

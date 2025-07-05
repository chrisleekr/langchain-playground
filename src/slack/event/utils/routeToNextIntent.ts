/**
 * Conditional router function
 *
 * 1st call:
 *  - currentIndex: -1
 *  - intentsToExecute: ['summarise-thread', 'translate-message']
 *  - executedIntents: []
 *  - set currentIndex to 0
 *  - return: 'summarise-thread'
 *
 * 2nd call:
 *  - currentIndex: 0
 *  - intentsToExecute: ['summarise-thread', 'translate-message']
 *  - executedIntents: ['summarise-thread']
 *  - set currentIndex to 1
 *  - return: 'translate-message'
 *
 * 3rd call:
 *  - currentIndex: 1
 *  - intentsToExecute: ['summarise-thread', 'translate-message']
 *  - executedIntents: ['summarise-thread', 'translate-message']
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

  // Get the next intent to execute
  const nextIntent = intentsToExecute[currentIndex];

  logger.info({ nextIntent, currentIndex }, 'routeToNextIntent response');

  // Special handling for general-response
  if (nextIntent === 'general-response') {
    return 'general-response';
  }

  return intentToNodeMap[nextIntent].node || 'final-response';
};

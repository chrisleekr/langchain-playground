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

  return intentToNodeMap[nextIntent].node || 'final-response';
};

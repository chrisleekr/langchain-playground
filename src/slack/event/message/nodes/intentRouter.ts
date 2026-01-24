import { logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

// Router node to handle sequential execution
export const intentRouterNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const currentIndex = state.currentIntentIndex ?? 0;
  const intentsToExecute = state.intentsToExecute || [];
  const executedIntents = state.executedIntents || [];

  logger.info({ currentIndex, intentsToExecute, executedIntents }, 'intentRouterNode request');

  if (currentIndex >= 0 && currentIndex < intentsToExecute.length) {
    // eslint-disable-next-line security/detect-object-injection -- Index bounds-checked above
    const currentIntent = intentsToExecute[currentIndex];
    executedIntents.push(currentIntent);
    state.executedIntents = executedIntents;
  }

  // Increment the currentIndex
  const nextIndex = currentIndex + 1;
  state.currentIntentIndex = nextIndex;

  logger.info({ state: { ...state, client: undefined } }, 'intentRouterNode response');

  return state;
};

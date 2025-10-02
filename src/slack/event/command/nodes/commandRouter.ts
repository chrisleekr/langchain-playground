import { logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

export const commandRouterNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { command } = state;

  logger.info({ command }, 'commandRouterNode request');

  state.intentsToExecute = [];

  if (command.command === '/generate-rca') {
    state.intentsToExecute = ['generate-rca'];
  }

  return state;
};

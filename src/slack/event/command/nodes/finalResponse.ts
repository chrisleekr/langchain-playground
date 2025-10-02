import { OverallStateAnnotation } from '../constants';

export const finalResponseNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  return state;
};

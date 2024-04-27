import { Router } from 'express';

import { validateRequest } from '@/libraries/httpHandlers';

import threadNewPost from '@/api/openai/thread/new.post';
import threadIdPost from '@/api/openai/thread/[id].post';
import threadIdGet from '@/api/openai//thread/[id].get';
import { GetOpenAIThreadId, PostOpenAIThreadId, PostOpenAIThreadNew } from './openaiSchema';

export const openAIRouter: Router = (() => {
  const router = Router();

  router.post('/thread', validateRequest(PostOpenAIThreadNew), threadNewPost());

  router.get('/thread/:id', validateRequest(GetOpenAIThreadId), threadIdGet());

  router.post('/thread/:id', validateRequest(PostOpenAIThreadId), threadIdPost());

  return router;
})();

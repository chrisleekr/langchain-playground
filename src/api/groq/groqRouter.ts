import { Router } from 'express';

import { validateRequest } from '@/libraries/httpHandlers';

import threadNewPost from '@/api/groq/thread/new.post';
import threadIdPost from '@/api/groq/thread/[id].post';
import threadIdGet from '@/api/groq//thread/[id].get';
import { GetGroqThreadId, PostGroqThreadId, PostGroqThreadNew } from './groqSchema';

export const groqRouter: Router = (() => {
  const router = Router();

  router.post('/thread', validateRequest(PostGroqThreadNew), threadNewPost());

  router.get('/thread/:id', validateRequest(GetGroqThreadId), threadIdGet());

  router.post('/thread/:id', validateRequest(PostGroqThreadId), threadIdPost());

  return router;
})();

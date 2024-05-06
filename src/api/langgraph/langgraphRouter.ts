import { Router } from 'express';

import { validateRequest } from '@/libraries/httpHandlers';

import documentLoadGet from '@/api/langgraph/document/load.get';
import threadNewPost from '@/api/langgraph/thread/new.post';
import threadIdPost from '@/api/langgraph/thread/[id].post';
import threadIdGet from '@/api/langgraph//thread/[id].get';
import { GetLanggraphThreadId, PostLanggraphThreadId, PostLanggraphThreadNew } from './langgraphSchema';

export const collectionName = 'langgraph';

export const langgraphRouter: Router = (() => {
  const router = Router();

  router.get('/document/load', documentLoadGet());

  router.post('/thread', validateRequest(PostLanggraphThreadNew), threadNewPost());

  router.get('/thread/:id', validateRequest(GetLanggraphThreadId), threadIdGet());

  router.post('/thread/:id', validateRequest(PostLanggraphThreadId), threadIdPost());

  return router;
})();

import { Router } from 'express';

import { validateRequest } from '@/libraries/httpHandlers';
import { GetOllamaThreadId, PostOllamaDocumentChat, PostOllamaThreadId, PostOllamaThreadNew } from '@/api/ollama/ollamaSchema';
import documentLoadGet from '@/api/ollama/document/load.get';
import documentChatPost from '@/api/ollama/document/chat.post';
import threadNewPost from '@/api/ollama/thread/new.post';
import threadIdPost from '@/api/ollama/thread/[id].post';
import threadIdGet from '@/api/ollama/thread/[id].get';

const collectionName = 'playground';

export const ollamaRouter: Router = (() => {
  const router = Router();

  router.get('/document/load', documentLoadGet(collectionName));

  router.post('/document/chat', validateRequest(PostOllamaDocumentChat), documentChatPost(collectionName));

  router.post('/thread', validateRequest(PostOllamaThreadNew), threadNewPost());

  router.get('/thread/:id', validateRequest(GetOllamaThreadId), threadIdGet());

  router.post('/thread/:id', validateRequest(PostOllamaThreadId), threadIdPost());

  return router;
})();

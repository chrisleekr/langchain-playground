import config from 'config';
import { Router } from 'express';

import { validateRequest } from '@/libraries/httpHandlers';
import { PostOllamaChat } from '@/api/ollama/ollamaSchema';
import documentLoadGet from '@/api/ollama/document/load.get';
import documentChatPost from '@/api/ollama/document/chat.post';

const collectionName = config.get('langchain.collectionName') as string;

export const ollamaRouter: Router = (() => {
  const router = Router();

  router.get('/document/load', documentLoadGet(collectionName));

  router.post('/document/chat', validateRequest(PostOllamaChat), documentChatPost(collectionName));

  return router;
})();

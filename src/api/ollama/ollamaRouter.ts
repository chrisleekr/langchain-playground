import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import { PostOllamaDocumentChat, PostOllamaThreadId } from '@/api/ollama/ollamaSchema';
import documentLoadGet from '@/api/ollama/document/load.get';
import documentChatPost from '@/api/ollama/document/chat.post';
import threadNewPost from '@/api/ollama/thread/new.post';
import threadIdPost from '@/api/ollama/thread/[id].post';
import threadIdGet from '@/api/ollama/thread/[id].get';

const collectionName = 'playground';

const ollamaRouter: FastifyPluginAsync = async fastify => {
  fastify.get('/document/load', createRouteSchema({}), documentLoadGet(collectionName));

  fastify.post('/document/chat', createRouteSchema({ body: PostOllamaDocumentChat }), documentChatPost(collectionName));

  fastify.post('/thread', createRouteSchema({}), threadNewPost());

  fastify.get('/thread/:id', createRouteSchema({}), threadIdGet());

  fastify.post('/thread/:id', createRouteSchema({ body: PostOllamaThreadId }), threadIdPost());
};

export default ollamaRouter;

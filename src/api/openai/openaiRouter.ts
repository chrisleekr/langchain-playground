import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import threadNewPost from '@/api/openai/thread/new.post';
import threadIdPost from '@/api/openai/thread/[id].post';
import threadIdGet from '@/api/openai//thread/[id].get';
import { PostOpenAIThreadId } from './openaiSchema';

const openAIRouter: FastifyPluginAsync = async fastify => {
  fastify.post('/thread', createRouteSchema({}), threadNewPost());

  fastify.get('/thread/:id', createRouteSchema({}), threadIdGet());

  fastify.post('/thread/:id', createRouteSchema({ body: PostOpenAIThreadId }), threadIdPost());
};

export default openAIRouter;

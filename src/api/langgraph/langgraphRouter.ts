import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import documentLoadGet from '@/api/langgraph/document/load.get';
import threadNewPost from '@/api/langgraph/thread/new.post';
import threadIdPost from '@/api/langgraph/thread/[id].post';
import threadIdGet from '@/api/langgraph//thread/[id].get';
import { PostLanggraphThreadId } from './langgraphSchema';

export const collectionName = 'langgraph';

const langgraphRouter: FastifyPluginAsync = async fastify => {
  fastify.get('/document/load', createRouteSchema({}), documentLoadGet());

  fastify.post('/thread', createRouteSchema({}), threadNewPost());

  fastify.get('/thread/:id', createRouteSchema({}), threadIdGet());

  fastify.post('/thread/:id', createRouteSchema({ params: PostLanggraphThreadId }), threadIdPost());
};

export default langgraphRouter;

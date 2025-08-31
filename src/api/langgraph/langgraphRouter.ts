import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import threadNewPost from '@/api/langgraph/thread/new.post';
import threadIdPost from '@/api/langgraph/thread/[id].post';
import threadIdGet from '@/api/langgraph/thread/[id].get';
import newRelicInvestigatePost from '@/api/langgraph/newrelic/investigate.post';
import sentryInvestigatePost from '@/api/langgraph/sentry/investigate.post';

import { PostLanggraphNewRelicInvestigate, PostLanggraphSentryInvestigate, PostLanggraphThreadId } from './langgraphSchema';

const langgraphRouter: FastifyPluginAsync = async fastify => {
  fastify.post('/thread', createRouteSchema({}), threadNewPost());

  fastify.get('/thread/:id', createRouteSchema({}), threadIdGet());

  fastify.post('/thread/:id', createRouteSchema({ body: PostLanggraphThreadId }), threadIdPost());

  fastify.post('/newrelic/investigate', createRouteSchema({ body: PostLanggraphNewRelicInvestigate }), newRelicInvestigatePost());

  fastify.post('/sentry/investigate', createRouteSchema({ body: PostLanggraphSentryInvestigate }), sentryInvestigatePost());
};

export default langgraphRouter;

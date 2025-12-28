import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import newRelicInvestigatePost from '@/api/agent/newrelic/investigate.post';
import { PostAgentNewRelicInvestigate } from './agentSchema';

const agentRouter: FastifyPluginAsync = async fastify => {
  fastify.post('/newrelic/investigate', createRouteSchema({ body: PostAgentNewRelicInvestigate }), newRelicInvestigatePost());
};

export default agentRouter;

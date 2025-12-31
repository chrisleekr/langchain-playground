import type { FastifyPluginAsync } from 'fastify/types/plugin';

import { createRouteSchema } from '@/libraries/httpHandlers';
import { investigatePost } from '@/api/agent/investigate';
import { PostAgentInvestigate } from './agentSchema';

/**
 * Fastify plugin that registers all agent-related routes.
 *
 * Routes:
 * - POST /investigate - Multi-agent investigation endpoint that accepts
 *   freeform text and routes to appropriate domain agents (New Relic, Sentry, etc.)
 *
 * @see investigate.post.ts for endpoint implementation details
 * @see services/investigation.ts for the core investigation logic
 */
const agentRouter: FastifyPluginAsync = async fastify => {
  fastify.post('/investigate', createRouteSchema({ body: PostAgentInvestigate }), investigatePost());
};

export default agentRouter;

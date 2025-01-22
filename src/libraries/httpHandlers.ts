import { type FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { ServiceResponse } from '@/models/serviceResponse';

export const sendResponse = async (reply: FastifyReply, serviceResponse: ServiceResponse<unknown>): Promise<void> => {
  await reply.header('Content-Type', 'application/json').header('Connection', 'keep-alive').status(serviceResponse.statusCode).send(serviceResponse);
};

export const createRouteSchema = <TSchema extends Record<string, unknown>>(schema: TSchema) => {
  const routeSchema: Record<string, unknown> = {
    querystring: schema.query || Type.Object({}),
    params: schema.params || Type.Object({}),
    response: {
      200: Type.Object({
        success: Type.Boolean(),
        message: Type.String(),
        data: Type.Union([Type.Null(), Type.Unknown()]),
        statusCode: Type.Number()
      })
    }
  };

  if (schema.body) {
    routeSchema.body = schema.body;
  }

  return { schema: routeSchema };
};

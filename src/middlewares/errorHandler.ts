import { type FastifyRequest, type FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { sendResponse } from '@/libraries/httpHandlers';

interface FastifyError extends Error {
  validation?: unknown;
  statusCode?: number;
}

type ErrorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => Promise<void>;

const errorHandler: () => ErrorHandler = () => async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  request.log.error(error);

  if (error.validation) {
    const errorMessage = 'Validation error occurred';
    const statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
    await sendResponse(reply, new ServiceResponse(ResponseStatus.Failed, errorMessage, error.validation, statusCode));
    return;
  }

  const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const errorMessage = error.message || 'Internal Server Error';

  await sendResponse(
    reply,
    new ServiceResponse(
      ResponseStatus.Failed,
      errorMessage,
      {
        trace: error.stack
      },
      statusCode
    )
  );
};

export default errorHandler;

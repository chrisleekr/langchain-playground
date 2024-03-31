import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError, ZodSchema } from 'zod';

import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export const handleServiceResponse = (serviceResponse: ServiceResponse<unknown>, response: Response) => {
  return response.status(serviceResponse.statusCode).send(serviceResponse);
};

export const validateRequest = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err) {
    const errorMessage = `Validation error occurred`;
    const data = (err as ZodError).errors;
    const statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
    res.status(statusCode).send(new ServiceResponse(ResponseStatus.Failed, errorMessage, data, statusCode));
  }
};

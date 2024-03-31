import { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { handleServiceResponse } from '@/libraries/httpHandlers';

export const healthRouter: Router = (() => {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', null, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  });

  return router;
})();

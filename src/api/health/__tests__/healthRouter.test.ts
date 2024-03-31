import { StatusCodes } from 'http-status-codes';
import request from 'supertest';

import { app } from '@/src/server';
import { ServiceResponse } from '@/models/serviceResponse';

describe('Health Check API endpoints', () => {
  let result: ServiceResponse;

  describe('GET /', () => {
    beforeEach(async () => {
      const response = await request(app).get('/health');
      result = response.body;
    });

    it('returns expected status code', () => {
      expect(result.statusCode).toEqual(StatusCodes.OK);
    });

    it('returns expected success status', () => {
      expect(result.success).toBeTruthy();
    });

    it('returns expected response object', () => {
      expect(result.data).toBeNull();
    });

    it('returns expected message', () => {
      expect(result.message).toEqual('OK');
    });
  });
});

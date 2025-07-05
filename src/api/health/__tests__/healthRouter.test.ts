import { StatusCodes } from 'http-status-codes';
import { ServiceResponse } from '@/models/serviceResponse';
import { startServerWithFastify } from '@/src/serverWithFastify';

describe('Health Check API endpoints', () => {
  let result: ServiceResponse;

  describe('GET /', () => {
    beforeEach(async () => {
      const { app } = await startServerWithFastify({ skipListen: true });
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });
      result = JSON.parse(response.payload);
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

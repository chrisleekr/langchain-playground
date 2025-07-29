import { executeNRQLQuery } from '../queries';

describe('queries', () => {
  describe('executeNRQLQuery', () => {
    let results: Record<string, unknown>[];

    beforeEach(async () => {
      results = await executeNRQLQuery({ query: 'SELECT * FROM Log LIMIT 10' });
    });

    it('should return the results', () => {
      expect(results).toEqual(expect.any(Array));
    });
  });
});

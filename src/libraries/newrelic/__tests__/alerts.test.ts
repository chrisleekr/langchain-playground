import { stringOrNull } from '@/test/helper';
import { getNewRelicAlert } from '../alerts';
import { NewRelicGraphQLDataActorAccountAlertsNRQLCondition } from '../types';

describe('alerts', () => {
  describe('getNewRelicAlert', () => {
    let alert: NewRelicGraphQLDataActorAccountAlertsNRQLCondition | null;

    beforeEach(async () => {
      alert = await getNewRelicAlert({ alertId: '53076058' });
    });

    it('returns the alert', () => {
      expect(alert).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        description: stringOrNull,
        nrql: {
          query: expect.any(String)
        },
        policyId: expect.any(String)
      });
    });
  });
});

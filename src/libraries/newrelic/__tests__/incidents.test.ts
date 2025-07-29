import { numberOrNull } from '@/test/helper';
import { getNewRelicIncidents } from '../incidents';
import { NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident } from '../types';

describe('issues', () => {
  describe('getNewRelicIssues', () => {
    let incidents: NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident[];

    beforeEach(async () => {
      incidents = await getNewRelicIncidents({ incidentIds: ['e955a20d-f78e-4932-8bbe-449d5aaaae7e'] });
    });

    it('should return the issues', () => {
      expect(incidents).toEqual([
        {
          title: expect.any(String),
          description: expect.any(Array),
          entityNames: expect.any(String),
          state: expect.any(String),
          priority: expect.any(String),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
          closedAt: numberOrNull,
          conditionFamilyId: expect.any(String)
        }
      ]);
    });
  });
});

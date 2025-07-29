import { numberOrNull } from '@/test/helper';
import { getNewRelicIssues } from '../issues';
import { NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue } from '../types';

describe('issues', () => {
  describe('getNewRelicIssues', () => {
    let issues: NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue[];

    beforeEach(async () => {
      issues = await getNewRelicIssues({ issueIds: ['954503dc-14a5-4f47-93e3-e6564f29f74f'] });
    });

    it('should return the issues', () => {
      expect(issues).toEqual([
        {
          title: expect.any(Array),
          description: expect.any(Array),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
          acknowledgedAt: numberOrNull,
          closedAt: numberOrNull,
          entityNames: expect.any(Array),
          incidentIds: expect.any(Array)
        }
      ]);
    });
  });
});

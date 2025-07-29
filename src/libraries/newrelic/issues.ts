import config from 'config';
import {
  GetNewRelicIssuesArgs,
  NewRelicGraphQLData,
  NewRelicGraphQLDataActorAccountAiIssues,
  NewRelicGraphQLDataActorAccountAiIssuesIssues,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue
} from './types';

export const getNewRelicIssues = async (args: GetNewRelicIssuesArgs): Promise<NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue[]> => {
  const { issueIds } = args;

  const query = `
    query GetAiIssues($accountId: Int!, $issueIds: [ID!]!) {
      actor {
        account(id: $accountId) {
          aiIssues {
            issues(filter: { ids: $issueIds }) {
              issues {
                title
                description
                createdAt
                updatedAt
                acknowledgedAt
                closedAt
                entityNames
                incidentIds
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.newrelic.com/graphql', {
    method: 'POST',
    headers: {
      'API-Key': config.get<string>('newrelic.apiKey'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { accountId: config.get<number>('newrelic.accountId'), issueIds } })
  });

  const responseData = (await response.json()) as NewRelicGraphQLData;

  const account = responseData.data.actor.account as NewRelicGraphQLDataActorAccountAiIssues;

  const aiIssues = account.aiIssues as NewRelicGraphQLDataActorAccountAiIssuesIssues;

  return aiIssues.issues.issues;
};

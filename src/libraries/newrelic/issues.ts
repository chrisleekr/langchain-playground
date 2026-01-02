import config from 'config';
import {
  GetNewRelicIssuesArgs,
  NewRelicGraphQLData,
  NewRelicGraphQLDataActorAccountAiIssues,
  NewRelicGraphQLDataActorAccountAiIssuesIssues,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue
} from './types';

/**
 * Fetch New Relic issues by their IDs.
 *
 * @param args - Arguments containing issue IDs
 * @returns Array of issue objects (empty if not found or on error)
 * @throws Error if the API request fails
 */
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

  if (!response.ok) {
    throw new Error(`New Relic API request failed: ${response.status} ${response.statusText}`);
  }

  const responseData = (await response.json()) as NewRelicGraphQLData;

  // Check for GraphQL errors
  if (responseData.errors && responseData.errors.length > 0) {
    throw new Error(`New Relic GraphQL error: ${responseData.errors.map(e => e.message).join(', ')}`);
  }

  // Safely navigate the response with null checks
  const account = responseData.data?.actor?.account as NewRelicGraphQLDataActorAccountAiIssues | undefined;
  if (!account) {
    throw new Error('New Relic API returned null account data');
  }

  const aiIssues = account.aiIssues as NewRelicGraphQLDataActorAccountAiIssuesIssues | undefined;
  if (!aiIssues?.issues?.issues) {
    return []; // No issues found
  }

  return aiIssues.issues.issues;
};

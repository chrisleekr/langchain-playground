import config from 'config';
import {
  GetNewRelicIncidentsArgs,
  NewRelicGraphQLData,
  NewRelicGraphQLDataActorAccountAiIssues,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidents,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident
} from './types';

/**
 * Fetch New Relic incidents by their IDs.
 *
 * @param args - Arguments containing incident IDs
 * @returns Array of incident objects (empty if not found or on error)
 * @throws Error if the API request fails
 */
export const getNewRelicIncidents = async (
  args: GetNewRelicIncidentsArgs
): Promise<NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident[]> => {
  const { incidentIds } = args;

  const query = `
    query GetAiIssues($accountId: Int!, $incidentIds: [ID!]!) {
      actor {
        account(id: $accountId) {
          aiIssues {
            incidents(filter: { ids: $incidentIds }) {
              incidents {
                title
                description
                entityNames
                state
                priority
                createdAt
                updatedAt
                closedAt
                ... on AiIssuesNewRelicIncident {
                  conditionFamilyId
                }
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
    body: JSON.stringify({ query, variables: { accountId: config.get<number>('newrelic.accountId'), incidentIds } })
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

  const aiIssues = account.aiIssues as NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidents | undefined;
  if (!aiIssues?.incidents?.incidents) {
    return []; // No incidents found
  }

  return aiIssues.incidents.incidents;
};

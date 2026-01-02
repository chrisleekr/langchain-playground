import config from 'config';
import { ExecuteNRQLQueryArgs, NewRelicGraphQLData, NewRelicGraphQLDataActorAccountNrql } from './types';

/**
 * Execute a NRQL query against New Relic.
 *
 * @param args - Arguments containing the NRQL query string
 * @returns Array of result records (empty if no results)
 * @throws Error if the API request fails or returns errors
 */
export const executeNRQLQuery = async (args: ExecuteNRQLQueryArgs): Promise<Record<string, unknown>[]> => {
  const { query: nrqlQuery } = args;

  const query = `
    query ExecuteNRQLQuery($accountId: Int!, $nrqlQuery: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $nrqlQuery) {
            results
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
    body: JSON.stringify({ query, variables: { accountId: config.get<number>('newrelic.accountId'), nrqlQuery } })
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
  const account = responseData.data?.actor?.account as NewRelicGraphQLDataActorAccountNrql | undefined;
  if (!account?.nrql) {
    return []; // No results
  }

  return (account.nrql.results || []) as unknown as Record<string, unknown>[];
};

import config from 'config';
import {
  GetNewRelicAlertsArgs,
  NewRelicGraphQLData,
  NewRelicGraphQLDataActorAccountAlerts,
  NewRelicGraphQLDataActorAccountAlertsNRQLCondition
} from './types';

/**
 * Fetch a New Relic alert condition by its ID.
 *
 * @param args - Arguments containing alert ID
 * @returns Alert condition object or null if not found
 * @throws Error if the API request fails
 */
export const getNewRelicAlert = async (args: GetNewRelicAlertsArgs): Promise<NewRelicGraphQLDataActorAccountAlertsNRQLCondition | null> => {
  const { alertId } = args;

  const query = `
    query GetAlert($accountId: Int!, $alertId: ID!) {
      actor {
        account(id: $accountId) {
          alerts {
            nrqlCondition(id: $alertId) {
              id
              name
              description
              policyId
              nrql {
                query
              }
              signal {
                aggregationWindow
                aggregationMethod
                aggregationDelay
                aggregationTimer
              }
              terms {
                operator
                priority
                threshold
                thresholdDuration
                thresholdOccurrences
              }
              type
              violationTimeLimitSeconds
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
    body: JSON.stringify({ query, variables: { accountId: config.get<number>('newrelic.accountId'), alertId } })
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
  const account = responseData.data?.actor?.account as NewRelicGraphQLDataActorAccountAlerts | undefined;
  if (!account?.alerts) {
    throw new Error('New Relic API returned null account data');
  }

  // nrqlCondition may be null if alert not found
  return account.alerts.nrqlCondition ?? null;
};

import config from 'config';
import {
  GetNewRelicAlertsArgs,
  NewRelicGraphQLData,
  NewRelicGraphQLDataActorAccountAlerts,
  NewRelicGraphQLDataActorAccountAlertsNRQLCondition
} from './types';

export const getNewRelicAlert = async (args: GetNewRelicAlertsArgs): Promise<NewRelicGraphQLDataActorAccountAlertsNRQLCondition> => {
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

  const responseData = (await response.json()) as NewRelicGraphQLData;

  const account = responseData.data.actor.account as NewRelicGraphQLDataActorAccountAlerts;

  const alert = account.alerts.nrqlCondition;

  return alert;
};

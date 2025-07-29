import config from 'config';
import { ExecuteNRQLQueryArgs, NewRelicGraphQLData, NewRelicGraphQLDataActorAccountNrql } from './types';

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

  const responseData = (await response.json()) as NewRelicGraphQLData;

  const account = responseData.data.actor.account as NewRelicGraphQLDataActorAccountNrql;

  return (account.nrql?.results || []) as unknown as Record<string, unknown>[];
};

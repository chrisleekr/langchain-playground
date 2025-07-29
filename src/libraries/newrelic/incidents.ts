import config from 'config';
import {
  GetNewRelicIncidentsArgs,
  NewRelicGraphQLData,
  NewRelicGraphQLDataActorAccountAiIssues,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidents,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident
} from './types';

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

  const responseData = (await response.json()) as NewRelicGraphQLData;

  const account = responseData.data.actor.account as NewRelicGraphQLDataActorAccountAiIssues;

  const aiIssues = account.aiIssues as NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidents;

  return aiIssues.incidents.incidents;
};

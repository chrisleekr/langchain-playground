export type GetNewRelicIssuesArgs = {
  issueIds: string[];
};

export type GetNewRelicIncidentsArgs = {
  incidentIds: string[];
};

export type GetNewRelicAlertsArgs = {
  alertId: string;
};

export type ExecuteNRQLQueryArgs = {
  query: string;
};

/**
 * GraphQL error object returned by New Relic API.
 */
export interface NewRelicGraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
}

export interface NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue {
  title: string[];
  description: string[];
  createdAt: number;
  updatedAt: number;
  acknowledgedAt: number | null;
  closedAt: number | null;
  entityNames: string[];
  incidentIds: string[];
}

export interface NewRelicGraphQLDataActorAccountAiIssuesIssues {
  issues: {
    issues: NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue[];
  };
}

export interface NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident {
  title: string;
  description: string[];
  entityNames: string;
  priority: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  conditionFamilyId: string;
}

export interface NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidents {
  incidents: {
    incidents: NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident[];
  };
}

export interface NewRelicGraphQLDataActorAccountAiIssues {
  aiIssues: NewRelicGraphQLDataActorAccountAiIssuesIssues | NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidents;
}

export interface NewRelicGraphQLDataActorAccountAlertsNRQLCondition {
  id: string;
  name: string;
  description: string | null;
  nrql: {
    query: string;
  };
  policyId: string;
}

export interface NewRelicGraphQLDataActorAccountAlerts {
  alerts: {
    nrqlCondition: NewRelicGraphQLDataActorAccountAlertsNRQLCondition;
  };
}

export interface NewRelicGraphQLDataActorAccountNrql {
  nrql: {
    results: Record<string, unknown>;
  };
}

export interface NewRelicGraphQLDataActorAccount {
  account: NewRelicGraphQLDataActorAccountAiIssues | NewRelicGraphQLDataActorAccountAlerts | NewRelicGraphQLDataActorAccountNrql;
}

export interface NewRelicGraphQLDataActor {
  actor: NewRelicGraphQLDataActorAccount;
}

/**
 * Standard GraphQL response from New Relic API.
 * Data may be null if there are errors.
 */
export interface NewRelicGraphQLData {
  data: NewRelicGraphQLDataActor | null;
  errors?: NewRelicGraphQLError[];
}

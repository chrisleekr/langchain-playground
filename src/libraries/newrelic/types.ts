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

export interface NewRelicGraphQLData {
  data: NewRelicGraphQLDataActor;
}

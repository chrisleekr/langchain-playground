// https://docs.sentry.io/api/events/retrieve-an-issue/
export interface GetSentryIssueArgs {
  issueId: string;
}

export interface SentryIssue {
  id: string;
  shareId: string | null;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  logger: string | null;
  level: string;
  status: string;
  statusDetails: Record<string, unknown>;
  substatus: string;
  isPublic: boolean;
  platform: string;
  project: {
    id: string;
    name: string;
    slug: string;
    platform: string;
  };
  type: string;
  metadata:
    | {
        value: string;
        type: string;
        filename: string;
        function: string;
        in_app_frame_mix: string;
        sdk: {
          name: string;
          name_normalized: string;
        };
        initial_priority: number;
        title: string | null;
      }
    | {
        title: string;
      };
  numComments: number;
  assignedTo: Record<string, unknown> | null;
  isBookmarked: boolean;
  isSubscribed: boolean;
  subscriptionDetails: Record<string, unknown> | null;
  hasSeen: boolean;
  annotations: {
    displayName: string;
    url: string;
  }[];
  issueType: string;
  issueCategory: string;
  priority: string;
  priorityLockedAt: string | null;
  seerFixabilityScore: number | null;
  seerAutofixLastTriggered: string | null;
  isUnhandled: boolean;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  firstRelease: Record<string, unknown> | null;
  lastRelease: Record<string, unknown> | null;
  tags: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  openPeriods: Record<string, unknown>[];
  seenBy: Record<string, unknown>[];
  pluginActions: string[][];
  pluginContexts: string[];
  pluginIssues: Record<string, unknown>[];
  userReportCount: number;
  stats: {
    '24h': number[][];
    '30d': number[][];
  };
  participants: Record<string, unknown>[];
}

// https://docs.sentry.io/api/events/retrieve-an-issue-event/

export interface GetSentryIssueEventArgs {
  issueId: string;
}

export interface SentryIssueEventEntryFrame {
  filename: string;
  absPath: string;
  module: string | null;
  package: string | null;
  platform: string | null;
  instructionAddr: string | null;
  symbolAddr: string | null;
  function: string | null;
  rawFunction: string | null;
  symbol: string | null;
  context: [number, string][] | null;
  lineNo: number;
  colNo: number;
  inApp: boolean;
  trust: string | null;
  errors: string | null;
  lock: string | null;
  sourceLink: string | null;
  vars: string | null;
}

export interface SentryIssueEventEntryDataExceptionValue {
  type: string;
  value: string;
  mechanism: {
    type: string;
    handled: boolean;
  } | null;
  threadId: string | null;
  module: string | null;
  stacktrace: {
    frames: SentryIssueEventEntryFrame[] | null;
    framesOmitted: number | null;
    registers: string | null;
    hasSystemFrames: boolean;
  } | null;
  rawStacktrace: {
    frames: SentryIssueEventEntryFrame[] | null;
  } | null;
}

export interface SentryIssueEventEntryDataRequest {
  url: string | null;
  headers: [string, string][];
}

export interface SentryIssueEventEntryDataException {
  values: SentryIssueEventEntryDataExceptionValue[];
  hasSystemFrames: boolean;
}

export interface SentryIssueEventEntry {
  type: string;
  data: SentryIssueEventEntryDataException | SentryIssueEventEntryDataRequest;
}

export interface SentryIssueEventError {
  type: string;
  message: string;
  data: Record<string, unknown>;
}

export interface SentryIssueEvent {
  id: string;
  groupID: string | null;
  eventID: string;
  projectID: string;
  size: number;
  entries: SentryIssueEventEntry[];
  dist: string | null;
  message: string | null;
  title: string;
  location: string | null;
  user: {
    id: string | null;
    email: string | null;
    username: string | null;
    ip_address: string | null;
    name: string | null;
    geo: Record<string, string> | null;
    data: Record<string, unknown> | null;
  };
  contexts: {
    browser: Record<string, unknown> | null;
    os: Record<string, unknown> | null;
    trace: Record<string, unknown> | null;
  } | null;
  sdk: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  packages: Record<string, unknown> | null;
  type: string;
  metadata: Record<string, unknown> | null;
  tags: Array<{
    key: string;
    value: string;
    query?: string;
  }>;
  platform: string | null;
  dateReceived: string | null;
  errors: SentryIssueEventError[];
  occurrence: Record<string, unknown> | null;
  _meta: Record<string, unknown> | null;
  crashFile: string | null;
  culprit: string | null;
  dateCreated: string;
  fingerprints: string[];
  groupingConfig: Record<string, unknown> | null;
  release?: Record<string, unknown> | null;
  userReport?: Record<string, unknown> | null;
  sdkUpdates?: Record<string, unknown> | null;
  resolvedWith?: string[] | null;
  nextEventID?: string | null;
  previousEventID?: string | null;
  startTimestamp?: string | null;
  endTimestamp?: string | null;
  measurements?: Record<string, unknown> | null;
  breakdowns?: Record<string, unknown> | null;
}

export interface SentryIssueEventNormalized {
  title: string;
  location: string | null;
  user: {
    id: string | null;
    email: string | null;
    geo: {
      country_code: string | null;
      city: string | null;
      region: string | null;
    };
  } | null;

  platform: string | null;
  additionInformation: Record<string, unknown> | null;

  deviceInformation: {
    browser: {
      browser: string | null;
      name: string | null;
      version: string | null;
      type: string | null;
    };
    os: {
      os: string | null;
      name: string | null;
      version: string | null;
      type: string | null;
    };
  } | null;

  requestInformation: {
    url: string | null;
    headers: [string, string][];
  } | null;

  tags: Record<string, string>[] | null;

  stacktrace:
    | {
        compiledFile: {
          fileName: string | null;
          function: string | null;
          lineNo: number | null;
          colNo: number | null;
          context: string[] | null;
        };
        sourceFile: {
          remoteLink: string | null;
          function: string | null;
          lineNo: number | null;
          colNo: number | null;
          context: string[] | null;
        };
      }[]
    | null;
}

// https://docs.sentry.io/api/events/debug-issues-related-to-source-maps-for-a-given-event/
export interface SentryIssueEventSourceMapDebugError {
  type: string;
  message: string;
  data: Record<string, unknown> | null;
}

export interface SentryEventSourceMapDebug {
  errors: SentryIssueEventSourceMapDebugError[];
}

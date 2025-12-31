import { describe, it, expect } from '@jest/globals';

import { sentrySystemPrompt } from '../prompts';

describe('sentrySystemPrompt', () => {
  it('defines the agent role as a Sentry specialist', () => {
    expect(sentrySystemPrompt).toContain('Senior Software Engineer');
    expect(sentrySystemPrompt).toContain('Sentry');
  });

  it('emphasizes calling tools rather than guessing', () => {
    expect(sentrySystemPrompt).toContain('MUST call tools');
    expect(sentrySystemPrompt).toContain('do NOT guess');
  });

  it('lists Sentry expertise areas', () => {
    expect(sentrySystemPrompt).toContain('error tracking');
    expect(sentrySystemPrompt).toContain('crash reporting');
    expect(sentrySystemPrompt).toContain('Stack trace');
  });

  it('describes investigation flow with correct tool names', () => {
    expect(sentrySystemPrompt).toContain('get_sentry_issue');
    expect(sentrySystemPrompt).toContain('get_sentry_events');
    expect(sentrySystemPrompt).toContain('analyze_sentry_error');
  });

  it('specifies output format requirements', () => {
    expect(sentrySystemPrompt).toContain('Error Summary');
    expect(sentrySystemPrompt).toContain('Root Cause');
    expect(sentrySystemPrompt).toContain('Recommendations');
  });
});

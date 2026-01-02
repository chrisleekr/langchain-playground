import { describe, it, expect } from '@jest/globals';

import { getSentrySystemPrompt } from '../prompts';

describe('getSentrySystemPrompt', () => {
  const prompt = getSentrySystemPrompt();

  it('defines the agent role as a Sentry specialist', () => {
    expect(prompt).toContain('Senior Software Engineer');
    expect(prompt).toContain('Sentry');
  });

  it('runs in autonomous mode without asking questions', () => {
    expect(prompt).toContain('AUTONOMOUS mode');
    expect(prompt).toContain('without asking questions');
  });

  it('emphasizes calling tools rather than guessing', () => {
    expect(prompt).toContain('MUST call tools');
    expect(prompt).toContain('do NOT guess');
  });

  it('lists Sentry expertise areas', () => {
    expect(prompt).toContain('error tracking');
    expect(prompt).toContain('crash reporting');
    expect(prompt).toContain('Stack trace');
  });

  it('describes the combined investigation tool', () => {
    expect(prompt).toContain('investigate_and_analyze_sentry_issue');
  });

  it('includes error handling guidelines', () => {
    expect(prompt).toContain('<error_handling>');
    expect(prompt).toContain('report the error');
  });

  it('specifies output format requirements', () => {
    expect(prompt).toContain('Error Summary');
    expect(prompt).toContain('Root Cause');
    expect(prompt).toContain('Recommendations');
  });

  it('includes current date/time context', () => {
    expect(prompt).toContain('Current date/time:');
  });
});

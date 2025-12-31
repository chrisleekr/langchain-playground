import { describe, it, expect } from '@jest/globals';

import { supervisorSystemPrompt } from '../prompts';

describe('supervisorSystemPrompt', () => {
  it('defines the supervisor role', () => {
    expect(supervisorSystemPrompt).toContain('Investigation Supervisor');
    expect(supervisorSystemPrompt).toContain('domain experts');
  });

  it('describes available domain experts', () => {
    expect(supervisorSystemPrompt).toContain('newrelic_expert');
    expect(supervisorSystemPrompt).toContain('sentry_expert');
  });

  it('lists New Relic capabilities', () => {
    expect(supervisorSystemPrompt).toContain('Alert investigations');
    expect(supervisorSystemPrompt).toContain('Log analysis');
    expect(supervisorSystemPrompt).toContain('NRQL');
  });

  it('lists Sentry capabilities', () => {
    expect(supervisorSystemPrompt).toContain('Stack trace analysis');
    expect(supervisorSystemPrompt).toContain('error');
  });

  it('provides investigation workflow guidance', () => {
    // Prompt uses XML tags for Claude compatibility
    expect(supervisorSystemPrompt).toContain('<workflow>');
    expect(supervisorSystemPrompt).toContain('Analyze the request');
    expect(supervisorSystemPrompt).toContain('Delegate to experts');
    expect(supervisorSystemPrompt).toContain('Synthesize findings');
  });

  it('specifies output format requirements', () => {
    // Prompt uses XML tags for Claude compatibility
    expect(supervisorSystemPrompt).toContain('<output_format>');
    expect(supervisorSystemPrompt).toContain('summary');
    expect(supervisorSystemPrompt).toContain('rootCause');
    expect(supervisorSystemPrompt).toContain('recommendations');
  });
});

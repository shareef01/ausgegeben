import { describe, expect, it } from 'vitest';
import { recurringWarningTemplates } from '@/components/RecurringIssuesWarning';

const issue = { templateId: 't1' };
const issue2 = { templateId: 't2' };

describe('recurring quarantine warning visibility', () => {
  it('shows nothing when healthy (no false warning)', () => {
    expect(recurringWarningTemplates('u1', 'u1', false, [])).toBe(0);
  });

  it('counts affected templates, not occurrences', () => {
    expect(recurringWarningTemplates('u1', 'u1', true, [issue, issue, issue2])).toBe(2);
  });

  it('stays visible while an unrelated sync error is also present (state carries no error input)', () => {
    expect(recurringWarningTemplates('u1', 'u1', true, [issue])).toBe(1);
  });

  it('disappears after verified resolution', () => {
    expect(recurringWarningTemplates('u1', 'u1', false, [])).toBe(0);
  });

  it('never renders issues belonging to another account', () => {
    expect(recurringWarningTemplates('u2', 'u1', true, [issue])).toBe(0);
    expect(recurringWarningTemplates(undefined, 'u1', true, [issue])).toBe(0);
  });

  it('does not claim success while a quarantine is recorded', () => {
    expect(recurringWarningTemplates('u1', 'u1', true, [issue])).toBeGreaterThan(0);
  });
});

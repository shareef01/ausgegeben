import { describe, expect, it } from 'vitest';
import {
  isNewlyCreatedAccount,
  isPreferencesSettled,
  nextPreferencesStatus,
  preferencesScreenFor,
  type PreferencesStatus,
} from '@/services/prefsLoadState';

describe('nextPreferencesStatus', () => {
  it('tracks the happy path', () => {
    expect(nextPreferencesStatus('idle', 'start')).toBe('loading');
    expect(nextPreferencesStatus('loading', 'loaded')).toBe('loaded');
    expect(nextPreferencesStatus('loading', 'missing')).toBe('missing');
    expect(nextPreferencesStatus('loaded', 'stop')).toBe('idle');
  });

  it('turns a timeout or listener error into the recovery state', () => {
    expect(nextPreferencesStatus('loading', 'timeout')).toBe('error');
    expect(nextPreferencesStatus('loading', 'listener-error')).toBe('error');
  });

  it('never downgrades a settled status', () => {
    for (const settled of ['loaded', 'missing'] as PreferencesStatus[]) {
      expect(nextPreferencesStatus(settled, 'timeout')).toBe(settled);
      expect(nextPreferencesStatus(settled, 'listener-error')).toBe(settled);
    }
  });

  it('treats only loaded/missing as settled', () => {
    expect(isPreferencesSettled('loaded')).toBe(true);
    expect(isPreferencesSettled('missing')).toBe(true);
    expect(isPreferencesSettled('loading')).toBe(false);
    expect(isPreferencesSettled('idle')).toBe(false);
    expect(isPreferencesSettled('error')).toBe(false);
  });
});

describe('preferencesScreenFor', () => {
  it('shows the loading screen while unknown work is in flight', () => {
    expect(preferencesScreenFor({ status: 'loading', onboardingKnown: false, onboardingComplete: false })).toBe('loading');
    expect(preferencesScreenFor({ status: 'idle', onboardingKnown: true, onboardingComplete: true })).toBe('loading');
  });

  it('shows an accessible recovery screen on error instead of guessing', () => {
    expect(preferencesScreenFor({ status: 'error', onboardingKnown: false, onboardingComplete: false })).toBe('recovery');
    expect(preferencesScreenFor({ status: 'error', onboardingKnown: true, onboardingComplete: true })).toBe('recovery');
  });

  it('onboards only a known, incomplete account', () => {
    expect(preferencesScreenFor({ status: 'loaded', onboardingKnown: true, onboardingComplete: false })).toBe('onboarding');
    expect(preferencesScreenFor({ status: 'missing', onboardingKnown: true, onboardingComplete: false })).toBe('onboarding');
  });

  it('never re-onboards a completed or unknown account', () => {
    expect(preferencesScreenFor({ status: 'loaded', onboardingKnown: true, onboardingComplete: true })).toBe('app');
    expect(preferencesScreenFor({ status: 'missing', onboardingKnown: true, onboardingComplete: true })).toBe('app');
    expect(preferencesScreenFor({ status: 'loaded', onboardingKnown: false, onboardingComplete: false })).toBe('app');
  });
});

describe('isNewlyCreatedAccount', () => {
  it('is true when the account has not signed in again since creation', () => {
    const t = 'Sun, 25 Oct 2026 10:00:00 GMT';
    expect(isNewlyCreatedAccount(t, t)).toBe(true);
  });

  it('is false for a sign-in shortly after creation', () => {
    // A returning account that signed in again seconds later must not be re-onboarded.
    expect(
      isNewlyCreatedAccount('Sun, 25 Oct 2026 10:00:00 GMT', 'Sun, 25 Oct 2026 10:00:03 GMT'),
    ).toBe(false);
  });

  it('is false for a later sign-in', () => {
    expect(
      isNewlyCreatedAccount('Mon, 01 Jun 2026 10:00:00 GMT', 'Sun, 25 Oct 2026 10:00:00 GMT'),
    ).toBe(false);
  });

  it('is false when the timestamps are missing or unreadable', () => {
    expect(isNewlyCreatedAccount(undefined, 'Sun, 25 Oct 2026 10:00:00 GMT')).toBe(false);
    expect(isNewlyCreatedAccount('garbage', 'garbage')).toBe(false);
  });
});

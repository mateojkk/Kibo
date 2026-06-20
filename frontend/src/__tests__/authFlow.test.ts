import { describe, expect, it } from 'vitest';
import { getPostLoginStep, normalizeInviteCode } from '../views/authFlow';

describe('authFlow helpers', () => {
  it('routes new users to the username step first', () => {
    expect(getPostLoginStep(true)).toBe('username');
    expect(getPostLoginStep(false)).toBe('connecting');
  });

  it('normalizes invite codes before submission', () => {
    expect(normalizeInviteCode(' kibo-61ab6226 ')).toBe('KIBO-61AB6226');
  });
});

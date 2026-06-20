import { describe, expect, it } from 'vitest';
import { getPostLoginStep } from '../views/authFlow';

describe('authFlow helpers', () => {
  it('routes new users to the username step first', () => {
    expect(getPostLoginStep(true)).toBe('username');
    expect(getPostLoginStep(false)).toBe('connecting');
  });
});

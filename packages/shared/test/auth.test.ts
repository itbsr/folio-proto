import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../src/index';

describe('registerSchema', () => {
  it('accepts a valid email and a password of at least 8 characters', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a password of exactly 8 characters', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: '12345678',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: '1234567',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Password must be at least 8 characters',
      );
    }
  });

  it('rejects a missing password', () => {
    const result = registerSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid email and a non-empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'nope',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 12345678,
    });
    expect(result.success).toBe(false);
  });
});

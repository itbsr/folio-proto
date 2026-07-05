import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// LoginPage only pulls `login` from the auth context; a stub is enough for a
// smoke render (no network — AuthContext/hc are never touched).
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

import { LoginPage } from '../src/pages/LoginPage';

describe('LoginPage', () => {
  it('renders the login form', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ログイン/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});

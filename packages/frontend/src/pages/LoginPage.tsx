import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="dot" />
          FOLIO / DOCUMENT STUDIO
        </div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">ログイン · Issue No.06</p>

        <form onSubmit={submit}>
          <div className="auth-field">
            <label className="auth-label">メールアドレス</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">パスワード</label>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="auth-error">✕ {error}</p>}
          <button
            type="submit"
            className="btn accent full"
            style={{ marginTop: 8 }}
            disabled={loading}
          >
            {loading ? '認証中…' : 'ログイン'}
            {!loading && <span className="arrow">→</span>}
          </button>
        </form>

        <div className="rule" style={{ marginTop: 28 }} />
        <p className="auth-link">
          アカウントがない方は <Link to="/register">新規登録</Link>
        </p>
      </div>
    </div>
  );
}

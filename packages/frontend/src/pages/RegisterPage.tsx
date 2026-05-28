import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import client from '../lib/hc';

export function RegisterPage() {
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
      const res = await client.api.auth.register.$post({ json: { email, password } });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '登録に失敗しました');
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
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
        <h1 className="auth-title">Register</h1>
        <p className="auth-sub">新規登録 · Issue No.06</p>

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
            <label className="auth-label">パスワード（8文字以上）</label>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="auth-error">✕ {error}</p>}
          <button
            type="submit"
            className="btn accent full"
            style={{ marginTop: 8 }}
            disabled={loading}
          >
            {loading ? '登録中…' : 'アカウント作成'}
            {!loading && <span className="arrow">→</span>}
          </button>
        </form>

        <div className="rule" style={{ marginTop: 28 }} />
        <p className="auth-link">
          すでにアカウントをお持ちの方は <Link to="/login">ログイン</Link>
        </p>
      </div>
    </div>
  );
}

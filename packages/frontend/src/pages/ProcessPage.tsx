import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ImageDropzone } from '../components/ImageDropzone';
import { BeforeAfter } from '../components/BeforeAfter';
import { UsageBar } from '../components/UsageBar';
import client from '../lib/hc';
import type { UsageInfo } from '@my-app/shared';

export function ProcessPage() {
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (base64: string) => {
    setInputImage(base64);
    setResultImage(null);
    setError('');
    setLoading(true);
    try {
      const res = await client.api.images.process.$post({ json: { image: base64 } });
      const data = await res.json() as { result_image?: string; usage?: UsageInfo; error?: string };
      if (!res.ok) throw new Error(data.error ?? '処理に失敗しました');
      setResultImage(data.result_image!);
      setUsage(data.usage!);
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${resultImage}`;
    a.download = 'dewarped.png';
    a.click();
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link to="/" style={styles.back}><ArrowLeft size={18} /> ダッシュボード</Link>
        <h1 style={styles.title}>画像補正</h1>
      </header>

      <main style={styles.main}>
        {usage && (
          <div style={styles.card}>
            <UsageBar used={usage.used} limit={usage.limit} />
          </div>
        )}

        <div style={styles.card}>
          <ImageDropzone onFile={handleFile} disabled={loading} />
          {loading && (
            <div style={styles.loadingRow}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14, color: '#6b7280' }}>補正中...</span>
            </div>
          )}
          {error && <p style={styles.error}>{error}</p>}
        </div>

        {inputImage && resultImage && (
          <div style={styles.card}>
            <BeforeAfter before={inputImage} after={resultImage} />
            <button onClick={download} style={styles.downloadButton}>
              補正画像をダウンロード
            </button>
          </div>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f9fafb' } as React.CSSProperties,
  header: { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties,
  back: { display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', textDecoration: 'none', fontSize: 14 } as React.CSSProperties,
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' } as React.CSSProperties,
  main: { maxWidth: 720, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column' as const, gap: 20 },
  card: { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' as const, gap: 16 },
  loadingRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0' } as React.CSSProperties,
  error: { margin: 0, color: '#ef4444', fontSize: 14 } as React.CSSProperties,
  downloadButton: { padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
};

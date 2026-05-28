type Props = { used: number; limit: number };

export function UsageBar({ used, limit }: Props) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#3b82f6';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14, color: '#6b7280' }}>
        <span>今月の使用量</span>
        <span style={{ fontWeight: 600, color: '#111827' }}>{used} / {limit} 回</span>
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

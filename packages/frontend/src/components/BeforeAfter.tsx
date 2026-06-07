type Props = { before: string; after: string };

export function BeforeAfter({ before, after }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {([['補正前', before], ['補正後', after]] as const).map(([label, src]) => (
        <div key={label}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </p>
          <img
            src={`data:image/png;base64,${src}`}
            alt={label}
            style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }}
          />
        </div>
      ))}
    </div>
  );
}

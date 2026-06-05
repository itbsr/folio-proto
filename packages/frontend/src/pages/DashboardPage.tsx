import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import client, { API_BASE } from '../lib/hc';
import type { UsageInfo, HistoryItem } from '@my-app/shared';

// ─────────────────────────────────────────────
// THEME SYSTEM
// ─────────────────────────────────────────────
type ThemeId = 'issue' | 'studio' | 'press';

const THEMES: Record<ThemeId, { name: string; vars: Record<string, string> }> = {
  issue: {
    name: 'Issue · 雑誌',
    vars: {
      '--bg': '#f4ede0', '--paper': '#fbf6ea', '--ink': '#0e0e0c',
      '--rule': 'rgba(14,14,12,0.18)', '--rule-strong': 'rgba(14,14,12,0.45)',
      '--mute': 'rgba(14,14,12,0.55)', '--accent': '#c8362b', '--accent-ink': '#fffaf2',
      '--font-serif': '"Instrument Serif","Noto Serif JP",Georgia,serif',
      '--font-sans': '"IBM Plex Sans","Noto Sans JP",system-ui,sans-serif',
      '--font-mono': '"IBM Plex Mono","JetBrains Mono",ui-monospace,monospace',
    },
  },
  studio: {
    name: 'Studio · 静謐',
    vars: {
      '--bg': '#faf3ec', '--paper': '#fffaf1', '--ink': '#2a1a14',
      '--rule': 'rgba(42,26,20,0.16)', '--rule-strong': 'rgba(42,26,20,0.40)',
      '--mute': 'rgba(42,26,20,0.52)', '--accent': '#6e8a5b', '--accent-ink': '#fffaf1',
      '--font-serif': '"DM Serif Display","Noto Serif JP",Georgia,serif',
      '--font-sans': '"Work Sans","Noto Sans JP",system-ui,sans-serif',
      '--font-mono': '"DM Mono","JetBrains Mono",ui-monospace,monospace',
    },
  },
  press: {
    name: 'Press · 印刷所',
    vars: {
      '--bg': '#ffffff', '--paper': '#f7f7f5', '--ink': '#0a0a0a',
      '--rule': 'rgba(10,10,10,0.16)', '--rule-strong': 'rgba(10,10,10,0.55)',
      '--mute': 'rgba(10,10,10,0.55)', '--accent': '#1c3fff', '--accent-ink': '#ffffff',
      '--font-serif': '"Space Grotesk","Noto Sans JP",system-ui,sans-serif',
      '--font-sans': '"Space Grotesk","Noto Sans JP",system-ui,sans-serif',
      '--font-mono': '"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace',
    },
  },
};

function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  Object.entries(THEMES[id].vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', id);
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
type ScreenId = 'home' | 'capture' | 'upload' | 'processing' | 'compare' | 'adjust' | 'filter' | 'export' | 'history';
type Lang = 'jp' | 'en';

const NAV_ITEMS: { id: ScreenId; no: string; label: Record<Lang, string>; kbd: string }[] = [
  { id: 'home',       no: '01', label: { jp: 'ホーム',         en: 'Home'        }, kbd: '1' },
  { id: 'capture',    no: '02', label: { jp: '撮影',           en: 'Capture'     }, kbd: '2' },
  { id: 'upload',     no: '03', label: { jp: 'アップロード',   en: 'Upload'      }, kbd: '3' },
  { id: 'processing', no: '04', label: { jp: '自動補正',       en: 'Auto-correct'}, kbd: '4' },
  { id: 'compare',    no: '05', label: { jp: 'Before / After', en: 'Compare'     }, kbd: '5' },
  { id: 'adjust',     no: '06', label: { jp: '手動調整',       en: 'Fine-tune'   }, kbd: '6' },
  { id: 'filter',     no: '07', label: { jp: 'フィルター',     en: 'Filters'     }, kbd: '7' },
  { id: 'export',     no: '08', label: { jp: 'PDF書き出し',    en: 'Export'      }, kbd: '8' },
  { id: 'history',    no: '09', label: { jp: '履歴',           en: 'Archive'     }, kbd: '9' },
];

// ─────────────────────────────────────────────
// SHARED ATOMS
// ─────────────────────────────────────────────
function DocPaperMock({ kind = 'essay', title, sub }: { kind?: 'essay' | 'notes' | 'receipt'; title?: string; sub?: string }) {
  return (
    <div className="doc-paper grain" style={{ width: '100%', height: '100%' }}>
      {title && <div className="doc-header">{title}</div>}
      {sub && <div className="doc-sub">{sub}</div>}
      <div className="doc-body">
        {kind === 'essay' && (
          <>
            <p>This paper investigates optical distortion and the act of reading. When the page is held at an angle, the reader's eye must reconstruct the rectangle.</p>
            <p>台形補正は射影変換の逆問題として定式化される。四隅を平面に写像し、紙面の意味が回復される。</p>
            <div className="doc-figure">FIG. 1 — perspective grid</div>
            <p>A page restored is a page that can be read.</p>
          </>
        )}
        {kind === 'notes' && (
          <>
            <p>5月14日 講義メモ — 認知心理学</p>
            <p>キーワード：射影変換、知覚補正、視覚野V1。</p>
            <div className="doc-figure">SKETCH — board diagram</div>
            <p>Q. ヒトの視覚はなぜ歪んだ紙面を補正できるのか？</p>
          </>
        )}
        {kind === 'receipt' && (
          <>
            <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>FOLIO BOOKS · KYOTO</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>2026-05-14 14:32</p>
            <div className="doc-figure">— items —</div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>NOTEBOOK A4 …… ¥ 480</p>
          </>
        )}
      </div>
    </div>
  );
}

function SkewedDocMock({ intensity = 'soft' }: { intensity?: 'soft' | 'default' | 'heavy' }) {
  const transforms = {
    soft: 'perspective(1200px) rotateX(6deg) rotateY(-8deg) rotate(-1.5deg)',
    default: 'perspective(900px) rotateX(8deg) rotateY(-14deg) rotate(-3deg)',
    heavy: 'perspective(700px) rotateX(14deg) rotateY(-22deg) rotate(-6deg)',
  };
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', perspective: '1200px' }}>
      <div style={{
        width: '62%', aspectRatio: '0.74',
        transform: transforms[intensity],
        transition: 'transform .8s cubic-bezier(.2,.6,.1,1)',
        boxShadow: '0 60px 80px -40px rgba(0,0,0,.5)',
      }}>
        <DocPaperMock kind="essay" title="On Straightening" sub="A FOLIO ESSAY · MAY 2026" />
      </div>
    </div>
  );
}

function CornerBrackets({ color = 'var(--accent)', inset = 14, size = 28, weight = 2 }: {
  color?: string; inset?: number; size?: number; weight?: number;
}) {
  const common: React.CSSProperties = {
    position: 'absolute', width: size, height: size,
    borderColor: color, borderStyle: 'solid',
  };
  return (
    <>
      <span style={{ ...common, top: inset, left: inset, borderWidth: `${weight}px 0 0 ${weight}px` }} />
      <span style={{ ...common, top: inset, right: inset, borderWidth: `${weight}px ${weight}px 0 0` }} />
      <span style={{ ...common, bottom: inset, left: inset, borderWidth: `0 0 ${weight}px ${weight}px` }} />
      <span style={{ ...common, bottom: inset, right: inset, borderWidth: `0 ${weight}px ${weight}px 0` }} />
    </>
  );
}

// ─────────────────────────────────────────────
// TICKER
// ─────────────────────────────────────────────
function Ticker({ lang, setLang, theme, onThemeClick }: {
  lang: Lang; setLang: (l: Lang) => void;
  theme: ThemeId; onThemeClick: () => void;
}) {
  const items = lang === 'jp' ? [
    <><b>ISSUE No.06</b> ／ 2026年5月</>,
    <>VOL. ⅩⅤ</>,
    <>東京・京都・福岡</>,
    <>本日の天気 <b>晴れ／23°C</b></>,
    <>今号特集 <b>SCAN ANY PAPER</b></>,
    <>編集・印刷 <b>FOLIO STUDIO</b></>,
    <>「真っ直ぐにする」ことの哲学</>,
    <>本のページの曲面も平らにします</>,
  ] : [
    <><b>ISSUE No.06</b> / MAY 2026</>,
    <>VOL. ⅩⅤ</>,
    <>TOKYO · KYOTO · FUKUOKA</>,
    <>WEATHER <b>FAIR · 23°C</b></>,
    <>THIS ISSUE <b>SCAN ANY PAPER</b></>,
    <>PRINTED BY <b>FOLIO STUDIO</b></>,
    <>ON THE PHILOSOPHY OF STRAIGHTENING</>,
    <>BOOK PAGE DEWARP SUPPORTED</>,
  ];
  const doubled = [...items, ...items];
  return (
    <header className="ticker">
      <div className="brand">
        <span className="dot" />
        FOLIO / DOC STUDIO
      </div>
      <div className="scroll">
        <div className="scroll-track">
          {doubled.map((item, i) => (
            <span key={i}>★ {item}</span>
          ))}
        </div>
      </div>
      <div className="meta">
        <button className="pill" onClick={onThemeClick} style={{ cursor: 'pointer' }}>
          {THEMES[theme].name.split(' ')[0].toUpperCase()}
        </button>
        <button onClick={() => setLang(lang === 'jp' ? 'en' : 'jp')} aria-label="Toggle language">
          <span style={{ color: lang === 'jp' ? 'var(--ink)' : 'var(--mute)', fontWeight: lang === 'jp' ? 600 : 400 }}>JP</span>
          <span style={{ color: 'var(--mute)', margin: '0 2px' }}>/</span>
          <span style={{ color: lang === 'en' ? 'var(--ink)' : 'var(--mute)', fontWeight: lang === 'en' ? 600 : 400 }}>EN</span>
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// SIDENAV
// ─────────────────────────────────────────────
function SideNav({ active, setActive, lang, historyCount }: {
  active: ScreenId; setActive: (id: ScreenId) => void; lang: Lang; historyCount: number;
}) {
  return (
    <nav className="sidenav">
      <div className="group-label">{lang === 'jp' ? '目次 ／ CONTENTS' : 'TABLE OF CONTENTS'}</div>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={'nav' + (active === item.id ? ' active' : '')}
          onClick={() => setActive(item.id)}
        >
          <span className="num">{item.no}</span>
          <span className="lbl">{item.label[lang]}</span>
          <span className="kbd">{item.kbd}</span>
        </button>
      ))}
      <div className="stats">
        <div><b>{historyCount}</b> {lang === 'jp' ? '件の処理履歴' : 'documents processed'}</div>
        <div>v1.0.0-beta · FOLIO</div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────
function FolioFoot({ active, lang }: { active: ScreenId; lang: Lang }) {
  const cur = NAV_ITEMS.find((n) => n.id === active);
  return (
    <footer className="folio-foot">
      <div>FOLIO · {lang === 'jp' ? '学生のためのドキュメント補正スタジオ' : 'Document Studio for Students'}</div>
      <div className="pageno">— page {cur ? parseInt(cur.no) : '—'} —</div>
      <div>© 2026 FOLIO PRESS · MMXXVI</div>
    </footer>
  );
}

// ─────────────────────────────────────────────
// SCREEN 01 · HOME
// ─────────────────────────────────────────────
function ScreenHome({ lang, go, usage, history }: {
  lang: Lang; go: (id: ScreenId) => void;
  usage: UsageInfo | null; history: HistoryItem[];
}) {
  const jp = lang === 'jp';
  const usedPct = usage ? Math.min((usage.used / usage.limit) * 100, 100) : 0;
  const usageColor = usedPct >= 90 ? 'var(--accent)' : usedPct >= 70 ? '#e07b00' : 'var(--ink)';

  return (
    <div className="screen reveal" data-screen-label="01 Home">
      {/* Masthead */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'end', gap: 20, paddingBottom: 22 }}>
        <div className="serif italic" style={{ fontSize: 22, color: 'var(--mute)' }}>No. 06</div>
        <div style={{ textAlign: 'center' }} className="label">
          {jp ? 'ISSUE No.06 ／ 2026年5月 · VOL. ⅩⅤ' : 'ISSUE No.06 / MAY 2026 · VOL. ⅩⅤ'}
        </div>
        <div className="serif italic" style={{ fontSize: 22, color: 'var(--mute)' }}>MMXXVI</div>
      </div>
      <div className="rule-double" />
      <div style={{ textAlign: 'center', paddingTop: 18, paddingBottom: 10 }} className="label">THE EDITORIAL</div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'clamp(80px, 14vw, 220px)', lineHeight: '.88', textAlign: 'center', letterSpacing: '-0.02em' }}>
        FOLIO
      </h1>
      <div style={{ textAlign: 'center', paddingTop: 10 }} className="label">
        DOCUMENT · <span style={{ color: 'var(--accent)' }}>STUDIO</span>
      </div>
      <div className="rule-double" style={{ marginTop: 22 }} />

      {/* Lede + Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 40, padding: '36px 0 0' }}>
        <div>
          <div className="kicker"><span className="star">★</span> {jp ? 'EDITOR\'S NOTE · 編集後記' : "EDITOR'S NOTE"}</div>
          <p className="serif" style={{ fontSize: 28, lineHeight: 1.25, margin: '12px 0 24px' }}>
            {jp
              ? 'ノート、レポート、レシート、本の見開きまで。スマホで撮るだけで、真っ直ぐな書類になります。'
              : 'Lecture notes, essays, receipts, even the curved page of an open book. Photograph any paper — Folio returns it straight.'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn lg accent" onClick={() => go('upload')}>
              {jp ? '書類を補正する' : 'Start correcting'}
              <span className="arrow">→</span>
            </button>
            <button className="btn lg ghost" onClick={() => go('history')}>
              {jp ? '処理履歴' : 'Archive'}
            </button>
          </div>

          {/* Usage */}
          {usage && (
            <div style={{ marginTop: 28, padding: '16px 18px', border: '1px solid var(--rule-strong)' }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="label">{jp ? '今月の使用量' : 'Monthly usage'}</span>
                <span className="mono" style={{ fontSize: 12, color: usageColor, fontWeight: 600 }}>
                  {usage.used} / {usage.limit} {jp ? '回' : 'requests'}
                </span>
              </div>
              <div className="bar">
                <i style={{ width: `${usedPct}%`, background: usageColor }} />
              </div>
            </div>
          )}

          {/* Features */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 32, paddingTop: 22, borderTop: '1px solid var(--rule)' }}>
            {[
              ['01', jp ? '台形補正' : 'Trapezoid', jp ? '射影変換で平面に' : 'Inverse projective transform'],
              ['02', jp ? '曲面補正' : 'Page-curl',  jp ? '本の曲面も対応' : 'Open-book cylinder unroll'],
              ['03', jp ? 'PDF書き出し' : 'PDF export', jp ? '複数枚をまとめて' : 'Batch pages into one PDF'],
            ].map(([n, h, d]) => (
              <div key={n}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 6 }}>§{n}</div>
                <div className="serif" style={{ fontSize: 20, lineHeight: 1.1, marginBottom: 6 }}>{h}</div>
                <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero document */}
        <div style={{ position: 'relative', minHeight: 380 }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <SkewedDocMock intensity="soft" />
          </div>
          <div style={{
            position: 'absolute', top: -8, left: -10, transform: 'rotate(-6deg)',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          }}>
            BEFORE · 歪んだ紙
          </div>
          <div style={{
            position: 'absolute', bottom: 12, right: 4,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)', letterSpacing: '0.1em',
          }}>
            <span>↳ DETECTED · 4 CORNERS</span>
            <span>CONFIDENCE 97.2%</span>
          </div>
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div style={{ marginTop: 52 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="kicker"><span className="star">§</span> {jp ? 'OVERLEAF · 最近の処理' : 'OVERLEAF · Recent documents'}</div>
            <button className="label" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => go('history')}>
              {jp ? '全件 →' : 'VIEW ALL →'}
            </button>
          </div>
          <div className="rule-thick" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '18px 0' }}>
            {history.slice(0, 3).map((item, i) => (
              <div key={item.id} className="card lift" style={{ padding: 0, cursor: 'pointer' }} onClick={() => go('compare')}>
                <div style={{ height: 160, position: 'relative', padding: 14, background: 'color-mix(in oklab, var(--ink) 4%, var(--bg))' }}>
                  <div style={{ position: 'absolute', inset: 12, transform: `rotate(${i % 2 ? 2 : -2}deg)` }}>
                    <DocPaperMock kind="essay" title="Document" sub={`PAGE 0${i + 1}`} />
                  </div>
                  <span className="tag" style={{ position: 'absolute', top: 10, left: 10, background: 'var(--bg)' }}>
                    {item.status === 'success' ? 'OK' : 'ERR'}
                  </span>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--rule)' }}>
                  <div>
                    <div className="serif" style={{ fontSize: 16, lineHeight: 1.2 }}>
                      {item.status === 'success' ? (jp ? '補正成功' : 'Corrected') : (jp ? 'エラー' : 'Error')}
                    </div>
                    <div className="label" style={{ marginTop: 3 }}>PROCESS LOG</div>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>
                    {new Date(item.created_at).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Digest stripe */}
      <div style={{
        marginTop: 32, padding: '22px 26px', background: 'var(--ink)', color: 'var(--bg)',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 24,
      }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--accent)' }}>★ WEEKLY DIGEST</div>
        <div className="serif italic" style={{ fontSize: 20 }}>
          {jp ? 'Folio は今週、紙を真っ直ぐに読める形にしました。' : 'Folio returned pages to readable form this week.'}
        </div>
        <button className="btn ghost" style={{ background: 'transparent', color: 'var(--bg)', borderColor: 'var(--bg)' }} onClick={() => go('history')}>
          ↗ {jp ? '履歴を見る' : 'Open archive'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 02 · CAPTURE (camera stub)
// ─────────────────────────────────────────────
function ScreenCapture({ lang, go }: { lang: Lang; go: (id: ScreenId) => void }) {
  const jp = lang === 'jp';
  const [mode, setMode] = useState<'auto' | 'manual' | 'batch'>('auto');
  const [grid, setGrid] = useState(true);
  const [flash, setFlash] = useState(false);

  const trigger = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    setTimeout(() => go('upload'), 400);
  };

  return (
    <div className="screen reveal" data-screen-label="02 Capture">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§02</span> {jp ? '撮影 ／ CAPTURE' : 'CAPTURE'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '書類を画面の枠に合わせてください' : 'Align the document inside the frame'}
          </h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(['auto', 'manual', 'batch'] as const).map((m) => (
            <button key={m} className={'tag' + (mode === m ? ' solid' : '')} style={{ cursor: 'pointer' }} onClick={() => setMode(m)}>
              {jp ? { auto: 'オート', manual: '手動', batch: '連続' }[m] : m}
            </button>
          ))}
        </div>
      </div>
      <div className="rule-thick" />

      <div className="capture-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, marginTop: 22 }}>
        {/* Viewfinder */}
        <div className="preview-canvas" style={{ position: 'relative', aspectRatio: '4/3', background: '#0c0c0a', overflow: 'hidden', color: '#fff' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(80% 60% at 50% 60%, #2a2521 0%, #141210 80%)',
          }} />
          <div style={{ position: 'absolute', inset: 0, padding: 60 }}>
            <SkewedDocMock intensity="soft" />
          </div>
          {/* Detection overlay */}
          <svg viewBox="0 0 100 75" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'screen' }}>
            <polygon points="30,18 76,21 79,60 27,57" fill="rgba(200,54,43,0.10)" stroke="var(--accent)" strokeWidth="0.4" strokeDasharray="0.6 0.5">
              <animate attributeName="stroke-dashoffset" from="0" to="-2.2" dur="2s" repeatCount="indefinite" />
            </polygon>
            {[[30, 18], [76, 21], [79, 60], [27, 57]].map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="1.4" fill="var(--accent)" />
                <circle cx={x} cy={y} r="2.8" fill="none" stroke="var(--accent)" strokeWidth="0.18" opacity="0.7">
                  <animate attributeName="r" from="1.6" to="4" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="1.6s" repeatCount="indefinite" />
                </circle>
              </g>
            ))}
          </svg>
          {grid && (
            <div style={{
              position: 'absolute', inset: 36, pointerEvents: 'none',
              backgroundImage: `linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)`,
              backgroundSize: '33.33% 33.33%',
            }} />
          )}
          <CornerBrackets color="#fff" />
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,.8)' }}>
            <span>● REC · {mode.toUpperCase()}</span>
            <span>4096 × 3072 · ƒ/1.8</span>
            <span style={{ color: 'var(--accent)' }}>◆ LOCKED</span>
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,.7)' }}>
            <span>EXPOSURE +0.3</span>
            <span>ISO 80 · 1/60s</span>
            <span>BATT 86%</span>
          </div>
          <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash ? 1 : 0, transition: 'opacity .12s', pointerEvents: 'none' }} />
        </div>

        {/* Inspector */}
        <aside className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{jp ? '検出済み' : 'DETECTED'}</div>
            <div className="serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{jp ? '4つの角を検出' : '4 corners locked'}</div>
            <div className="rule" style={{ margin: '12px 0' }} />
            <div className="row between">
              <span className="label">{jp ? '信頼度' : 'CONFIDENCE'}</span>
              <span className="mono" style={{ fontSize: 12 }}>97.2%</span>
            </div>
            <div className="bar" style={{ marginTop: 8 }}><i style={{ width: '97.2%' }} /></div>
          </div>
          <div className="card">
            <div className="row between">
              <span className="label">{jp ? 'グリッド' : 'GRID'}</span>
              <button className={'tag' + (grid ? ' solid' : '')} style={{ cursor: 'pointer' }} onClick={() => setGrid(!grid)}>
                {grid ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <div className="card" style={{ background: 'color-mix(in oklab, var(--accent) 8%, var(--bg))', borderColor: 'var(--accent)' }}>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 8 }}>★ {jp ? 'ヒント' : 'HINT'}</div>
            <p className="serif italic" style={{ margin: 0, fontSize: 15, lineHeight: 1.35 }}>
              {jp ? '明るい場所で、紙を平らに置き、影を避けると認識精度が上がります。' : 'Use even lighting and lay the page flat for best recognition.'}
            </p>
          </div>
          <button className="btn ghost" onClick={() => go('upload')}>
            ↑ {jp ? 'ファイルをアップロード' : 'Upload a file instead'}
          </button>
        </aside>
      </div>

      {/* Shutter */}
      <div style={{ marginTop: 22, padding: '18px 22px', border: '1px solid var(--rule-strong)', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24 }}>
        <div className="row" style={{ gap: 14 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>← {jp ? '前回の撮影' : 'LAST CAPTURE'}</span>
          <div style={{ width: 40, height: 50, border: '1px solid var(--rule-strong)', background: 'var(--paper)' }} />
        </div>
        <button onClick={trigger} aria-label="Shutter" style={{ width: 84, height: 84, borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--bg)', display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative' }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
          <span style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1px solid var(--rule)' }} />
        </button>
        <div className="row" style={{ gap: 14, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => go('upload')} style={{ padding: '8px 14px' }}>→</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 03 · UPLOAD
// ─────────────────────────────────────────────
function ScreenUpload({ lang, go, onFile }: { lang: Lang; go: (id: ScreenId) => void; onFile: (b64: string) => void }) {
  const jp = lang === 'jp';
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string).split(',')[1];
      onFile(result);
      go('processing');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="screen reveal" data-screen-label="03 Upload">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§03</span> {jp ? 'アップロード ／ UPLOAD' : 'UPLOAD'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '机の上の紙を、画面の中へ。' : 'Bring paper into the page.'}
          </h2>
        </div>
        <button className="btn ghost" onClick={() => go('capture')}>
          ← {jp ? 'カメラに切替' : 'Switch to camera'}
        </button>
      </div>
      <div className="rule-thick" />

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 28, marginTop: 24 }}>
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          style={{
            position: 'relative', minHeight: 400, cursor: 'copy',
            border: `2px dashed ${over ? 'var(--accent)' : 'var(--rule-strong)'}`,
            background: over ? 'color-mix(in oklab, var(--accent) 10%, var(--bg))' : 'var(--bg)',
            display: 'grid', placeItems: 'center', transition: 'all .25s', overflow: 'hidden',
          }}
        >
          <CornerBrackets color="var(--ink)" inset={20} size={36} />
          {/* Floating paper hints */}
          <div style={{ position: 'absolute', top: '12%', left: '8%', transform: 'rotate(-8deg)', width: 100, height: 130, animation: 'floatA 6s ease-in-out infinite' }}>
            <DocPaperMock kind="notes" title="Notes" sub="MAY 14" />
          </div>
          <div style={{ position: 'absolute', top: '10%', right: '10%', transform: 'rotate(6deg)', width: 100, height: 130, animation: 'floatB 7s ease-in-out infinite' }}>
            <DocPaperMock kind="essay" title="Essay" sub="MAY 12" />
          </div>
          <style>{`
            @keyframes floatA { 0%,100%{ transform: rotate(-8deg) translateY(0);} 50%{ transform: rotate(-6deg) translateY(-10px);} }
            @keyframes floatB { 0%,100%{ transform: rotate(6deg) translateY(0);}  50%{ transform: rotate(8deg)  translateY(-14px);} }
          `}</style>
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, padding: 24 }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: '50%', border: `2px solid ${over ? 'var(--accent)' : 'var(--ink)'}`, display: 'grid', placeItems: 'center', color: over ? 'var(--accent)' : 'var(--ink)', transition: 'all .25s' }}>
              <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4 16v4h16v-4M12 4v12M6 10l6-6 6 6" />
              </svg>
            </div>
            <div className="serif" style={{ fontSize: 36, lineHeight: 1, marginBottom: 8 }}>
              {over ? (jp ? 'ここに離す' : 'Release') : (jp ? 'ファイルをここへ落とす' : 'Drop a document here')}
            </div>
            <div className="label">{jp ? 'または' : 'or'}</div>
            <button className="btn" style={{ marginTop: 14 }} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
              {jp ? 'ファイルを選択' : 'Browse files'} <span className="arrow">→</span>
            </button>
            <div className="label" style={{ marginTop: 14 }}>JPG · PNG · HEIC · PDF · {jp ? '最大 50 MB' : 'up to 50 MB'}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handle(e.target.files?.[0])} />
        </div>

        {/* Sidebar tips */}
        <aside className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>★ {jp ? '対応フォーマット' : 'SUPPORTED FORMATS'}</div>
            {['JPG / JPEG', 'PNG', 'HEIC / HEIF', 'PDF'].map((f) => (
              <div key={f} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--rule)', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <span className="mono" style={{ fontSize: 12 }}>{f}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ background: 'color-mix(in oklab, var(--accent) 8%, var(--bg))', borderColor: 'var(--accent)' }}>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 8 }}>★ TIP</div>
            <p className="serif italic" style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>
              {jp
                ? '複数のファイルを選択すると、それぞれ別ページとして PDF にまとめられます。'
                : 'Select many files and Folio will bind them as separate pages of one PDF.'}
            </p>
          </div>
          <button className="btn accent full" onClick={() => go('processing')}>
            {jp ? '次へ：自動補正' : 'Next · Auto-correct'} <span className="arrow">→</span>
          </button>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 04 · PROCESSING
// ─────────────────────────────────────────────
function ScreenProcessing({ lang, go, inputImage, onResult }: {
  lang: Lang; go: (id: ScreenId) => void;
  inputImage: string | null; onResult: (result: string, usage: UsageInfo) => void;
}) {
  const jp = lang === 'jp';
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState('');
  const [sendPct, setSendPct] = useState(0);
  const [inferPct, setInferPct] = useState(0);
  const [receivePct, setReceivePct] = useState(0);
  const startTime = useRef(Date.now());

  const phaseLogs = ['DECODE / PREPROCESS', 'WC MODEL INFERENCE', 'BM MODEL INFERENCE', 'UNWARP / ENCODE'];

  const stagePhase: Record<string, number> = {
    decode: 0, wc_preprocess: 0,
    wc_inference: 1,
    bm_inference: 2,
    unwarp: 3, encode: 3, done: 3,
  };

  useEffect(() => {
    if (!inputImage) return;

    const controller = new AbortController();

    (async () => {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/images/process-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: inputImage }),
          signal: controller.signal,
        });
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : jp ? 'ネットワークエラー' : 'Network error');
        return;
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        setError(
          res.status === 429
            ? (jp ? '処理上限に達しました' : 'Quota exceeded')
            : (d.error as string) ?? (jp ? '処理に失敗しました' : 'Processing failed'),
        );
        return;
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let firstEvent = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(part.slice(6).trim()); } catch { continue; }
          if (ev.error) { setError(ev.error as string); return; }

          if (firstEvent) { setSendPct(100); firstEvent = false; }

          if (ev.progress != null) {
            const overall = ev.progress as number;
            setPct(overall);
            if (ev.stage !== 'done') {
              setInferPct(Math.round(Math.min(100, Math.max(0, ((overall - 5) / 90) * 100))));
            }
          }
          if (ev.stage != null && stagePhase[ev.stage as string] != null) {
            setPhase(stagePhase[ev.stage as string]);
          }
          if (ev.stage === 'done') {
            setInferPct(100);
            setReceivePct(100);
            onResult(ev.result as string, ev.usage as UsageInfo);
            setTimeout(() => go('compare'), 700);
            return;
          }
        }
      }
    })().catch((e) => {
      if (e?.name !== 'AbortError') {
        setError(e instanceof Error ? e.message : jp ? '処理に失敗しました' : 'Processing failed');
      }
    });

    return () => controller.abort();
  }, []);

  const elapsed = (Date.now() - startTime.current) / 1000;
  const sec = elapsed.toFixed(1);
  const estimated = pct > 0 ? (elapsed / pct) * 100 : 0;
  const left = Math.max(0, estimated - elapsed).toFixed(1);

  const pipeline = [
    {
      id: 'send',
      en: 'TRANSMIT', jp: '送信',
      pct: sendPct,
      statusEn: sendPct === 0 ? 'Uploading image data…' : 'Image received by server',
      statusJp: sendPct === 0 ? '画像データを送信中…' : 'サーバーが受付完了',
    },
    {
      id: 'infer',
      en: 'INFERENCE', jp: '推論',
      pct: inferPct,
      statusEn: inferPct === 0 ? 'Awaiting pipeline…' : inferPct < 100 ? phaseLogs[Math.min(phase, 3)] : 'Model inference complete',
      statusJp: inferPct === 0 ? 'パイプライン待機中…' : inferPct < 100 ? '推論実行中…' : 'モデル推論完了',
    },
    {
      id: 'recv',
      en: 'RECEIVE', jp: '受信',
      pct: receivePct,
      statusEn: receivePct === 0 ? 'Awaiting result transfer…' : 'Result delivered',
      statusJp: receivePct === 0 ? '結果の受信待機中…' : '受信完了',
    },
  ];

  return (
    <div className="screen" data-screen-label="04 Processing">
      <style>{`
        @keyframes sweep { 0%{ transform: translateY(-100%);} 100%{ transform: translateY(100%);} }
        @keyframes pipelinePulse { 0%,100%{opacity:0.04} 50%{opacity:0.1} }
        @keyframes dotBlink { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes barShimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
      `}</style>

      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§04</span> {jp ? '自動補正中 ／ AUTO-CORRECT' : 'AUTO-CORRECT'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '数式が紙を真っ直ぐにします。' : 'Mathematics, then a flat page.'}
          </h2>
        </div>
        {error && (
          <button className="btn ghost" onClick={() => go('upload')}>← {jp ? 'やり直す' : 'Retry'}</button>
        )}
      </div>
      <div className="rule-thick" />

      <div className="capture-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28, marginTop: 24 }}>
        {/* Canvas */}
        <div className="preview-canvas" style={{ position: 'relative', aspectRatio: '4/3', background: '#0c0c0a', overflow: 'hidden' }}>
          {inputImage ? (
            <img
              src={`data:image/png;base64,${inputImage}`}
              alt="Processing"
              style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.6, filter: pct >= 100 ? 'none' : `blur(${0.5 * (1 - pct / 100)}px) brightness(0.7)`, transition: 'all .4s' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, padding: 50 }}>
              <SkewedDocMock intensity={pct >= 100 ? 'soft' : 'default'} />
            </div>
          )}
          {pct < 100 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, transparent 0%, transparent 38%, rgba(200,54,43,.28) 50%, transparent 62%, transparent 100%)', animation: 'sweep 1.6s linear infinite' }} />
          )}
          <div style={{ position: 'absolute', inset: 28, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(200,54,43,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(200,54,43,.18) 1px, transparent 1px)`, backgroundSize: '12.5% 12.5%', opacity: phase >= 1 ? 0 : 0.7, transition: 'opacity .4s' }} />
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,.85)' }}>
            <span>● {phaseLogs[Math.min(phase, 3)]}</span>
            <span>{pct.toFixed(0)}%</span>
            <span>{pct >= 100 ? '✓ DONE' : 'PROCESSING…'}</span>
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,.7)' }}>
            <span>HOMOGRAPHY 3×3</span>
            <span>RMS ERR 0.18 px</span>
            <span>{jp ? '経過' : 'ELAPSED'} {sec}s · {jp ? '残り' : 'LEFT'} {left}s</span>
          </div>
        </div>

        {/* Pipeline panel */}
        <aside className="col" style={{ gap: 0 }}>
          <div style={{ border: '1px solid var(--rule-strong)', overflow: 'hidden' }}>
            {/* Panel header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--rule-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'var(--mute)' }}>PIPELINE STATUS</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--mute)' }}>
                {pct >= 100 ? '✓ COMPLETE' : '● RUNNING'}
              </span>
            </div>

            {/* Three stage rows */}
            {pipeline.map(({ id, en, jp: labelJp, pct: stagePct, statusEn, statusJp }, idx) => {
              const complete = stagePct >= 100;
              const active = stagePct > 0 && stagePct < 100;
              const pending = stagePct === 0;
              const accentRgb = 'var(--accent)';

              return (
                <div
                  key={id}
                  style={{
                    position: 'relative',
                    padding: '18px 16px 16px',
                    borderBottom: idx < pipeline.length - 1 ? '1px solid var(--rule)' : 'none',
                    transition: 'background 0.4s',
                    background: active ? 'rgba(0,0,0,0.02)' : 'transparent',
                    overflow: 'hidden',
                  }}
                >
                  {/* Active glow overlay */}
                  {active && (
                    <div style={{ position: 'absolute', inset: 0, background: accentRgb, pointerEvents: 'none', animation: 'pipelinePulse 2.4s ease-in-out infinite' }} />
                  )}

                  {/* Stage label row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em', color: pending ? 'var(--mute)' : complete ? accentRgb : 'var(--ink)', marginBottom: 2, transition: 'color 0.3s' }}>
                        {jp ? labelJp : en}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: active ? accentRgb : 'var(--mute)', transition: 'color 0.3s' }}>
                        {active && <span style={{ animation: 'dotBlink 1.2s ease-in-out infinite', display: 'inline-block' }}>◆ </span>}
                        {complete && '▸ '}
                        {pending && '○ '}
                        {jp ? statusJp : statusEn}
                      </div>
                    </div>

                    {/* Large percentage */}
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: complete ? 18 : 38,
                      lineHeight: 1,
                      fontFeatureSettings: "'tnum'",
                      color: complete ? accentRgb : pending ? 'var(--rule-strong)' : 'var(--ink)',
                      letterSpacing: complete ? '0.05em' : '-0.02em',
                      transition: 'all 0.3s',
                      minWidth: 68,
                      textAlign: 'right',
                      alignSelf: 'center',
                    }}>
                      {complete
                        ? (jp ? '完了' : 'DONE')
                        : `${String(stagePct).padStart(2, '0')}%`}
                    </div>
                  </div>

                  {/* Progress bar track */}
                  <div style={{ position: 'relative', height: 2, background: 'var(--rule)' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, height: '100%',
                      width: `${stagePct}%`,
                      background: active
                        ? `linear-gradient(90deg, ${accentRgb}, color-mix(in srgb, var(--accent) 70%, transparent), ${accentRgb})`
                        : accentRgb,
                      backgroundSize: active ? '200% 100%' : '100% 100%',
                      animation: active ? 'barShimmer 1.8s linear infinite' : 'none',
                      transition: 'width 0.15s ease-out',
                    }} />
                    {/* Tick marks at 25/50/75 */}
                    {[25, 50, 75].map(t => (
                      <div key={t} style={{ position: 'absolute', left: `${t}%`, top: -2, width: 1, height: 6, background: 'var(--rule)', opacity: 0.6 }} />
                    ))}
                  </div>

                  {/* Scale labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    {['0', '25', '50', '75', '100'].map(v => (
                      <span key={v} style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--mute)', opacity: 0.6, letterSpacing: '0.05em' }}>{v}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error card */}
          {error && (
            <div className="card" style={{ borderColor: 'var(--accent)', marginTop: 12 }}>
              <div className="label" style={{ color: 'var(--accent)', marginBottom: 6 }}>ERROR</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mute)' }}>{error}</p>
              <button className="btn ghost" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => go('upload')}>
                ← {jp ? '戻る' : 'Back to upload'}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 05 · COMPARE (Before/After)
// ─────────────────────────────────────────────
function ScreenCompare({ lang, go, inputImage, resultImage }: {
  lang: Lang; go: (id: ScreenId) => void;
  inputImage: string | null; resultImage: string | null;
}) {
  const jp = lang === 'jp';
  const [pos, setPos] = useState(48);
  const [mode, setMode] = useState<'split' | 'stack' | 'overlay'>('split');
  const wrapRef = useRef<HTMLDivElement>(null);

  const onDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const x = clientX - r.left;
    setPos(Math.max(0, Math.min(100, (x / r.width) * 100)));
  }, []);

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    onDrag(e.nativeEvent as MouseEvent | TouchEvent);
    const move = (ev: MouseEvent | TouchEvent) => onDrag(ev);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
  };

  const hasImages = inputImage && resultImage;
  const beforeSrc = inputImage ? `data:image/png;base64,${inputImage}` : null;
  const afterSrc  = resultImage ? `data:image/png;base64,${resultImage}` : null;

  const modeLabels = { split: jp ? 'スプリット' : 'Split', stack: jp ? '並列' : 'Side by side', overlay: jp ? '重ね' : 'Overlay' };

  return (
    <div className="screen reveal" data-screen-label="05 Compare">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§05</span> Before / After</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '歪んだ紙が、読める紙に。' : 'From distorted paper to a readable page.'}
          </h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(['split', 'stack', 'overlay'] as const).map((m) => (
            <button key={m} className={'tag' + (mode === m ? ' solid' : '')} style={{ cursor: 'pointer' }} onClick={() => setMode(m)}>
              {modeLabels[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="rule-thick" />

      <div className="capture-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28, marginTop: 24 }}>
        {/* Compare canvas */}
        <div
          ref={wrapRef}
          className="preview-canvas"
          onMouseDown={mode === 'split' ? startDrag : undefined}
          onTouchStart={mode === 'split' ? startDrag : undefined}
          style={{ position: 'relative', aspectRatio: '4/3', background: 'var(--paper)', overflow: 'hidden', cursor: mode === 'split' ? 'ew-resize' : 'default', userSelect: 'none' }}
        >
          {mode === 'split' && (
            <>
              {/* BEFORE */}
              <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(0 0, ${pos}% 0, ${pos}% 100%, 0 100%)`, background: '#1a1815' }}>
                {beforeSrc ? (
                  <img src={beforeSrc} alt="Before" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ padding: 38, height: '100%' }}><SkewedDocMock intensity="default" /></div>
                )}
                <div style={{ position: 'absolute', top: 18, left: 18, background: 'var(--accent)', color: 'var(--accent-ink)', padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em' }}>
                  BEFORE · {jp ? '撮影直後' : 'raw capture'}
                </div>
              </div>
              {/* AFTER */}
              <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(${pos}% 0, 100% 0, 100% 100%, ${pos}% 100%)`, background: 'var(--paper)' }}>
                {afterSrc ? (
                  <img src={afterSrc} alt="After" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ padding: 38, height: '100%' }}>
                    <div style={{ width: '62%', height: '100%', margin: '0 auto' }}>
                      <DocPaperMock kind="essay" title="Corrected" sub="FOLIO · PROCESSED" />
                    </div>
                  </div>
                )}
                <div style={{ position: 'absolute', top: 18, right: 18, background: 'var(--ink)', color: 'var(--bg)', padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em' }}>
                  AFTER · {jp ? '補正後' : 'corrected'}
                </div>
              </div>
              {/* Divider */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 1, background: 'var(--accent)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', boxShadow: '0 6px 18px rgba(0,0,0,.3)', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>↔</div>
                <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--bg)', padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                  {jp ? '← つまみをドラッグ →' : '← drag the handle →'}
                </div>
              </div>
            </>
          )}
          {mode === 'stack' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%' }}>
              <div style={{ background: '#1a1815', position: 'relative', overflow: 'hidden' }}>
                {beforeSrc ? <img src={beforeSrc} alt="Before" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ padding: 20, height: '100%' }}><SkewedDocMock /></div>}
                <div style={{ position: 'absolute', top: 14, left: 14, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em' }}>BEFORE</div>
              </div>
              <div style={{ background: 'var(--paper)', position: 'relative', overflow: 'hidden', borderLeft: '1px solid var(--rule-strong)' }}>
                {afterSrc ? <img src={afterSrc} alt="After" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ padding: 20, height: '100%' }}><DocPaperMock kind="essay" title="Corrected" /></div>}
                <div style={{ position: 'absolute', top: 14, right: 14, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em' }}>AFTER</div>
              </div>
            </div>
          )}
          {mode === 'overlay' && (
            <div style={{ position: 'relative', height: '100%', padding: 28, background: 'var(--paper)' }}>
              {afterSrc && <img src={afterSrc} alt="After" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
              {beforeSrc && <img src={beforeSrc} alt="Before" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply', opacity: 0.35 }} />}
              {!afterSrc && <DocPaperMock kind="essay" title="Overlay" />}
              <div style={{ position: 'absolute', top: 14, left: 14, background: 'var(--ink)', color: 'var(--bg)', padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>OVERLAY · Δ</div>
            </div>
          )}
        </div>

        {/* Metrics + Actions */}
        <aside className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>{jp ? '解析メトリクス' : 'ANALYSIS METRICS'}</div>
            {[
              [jp ? '歪み角度' : 'Skew angle', '13.6°', '→ 0.0°', 100],
              [jp ? 'コントラスト' : 'Contrast', '0.42', '→ 0.71', 71],
              [jp ? '輪郭の鮮鋭度' : 'Sharpness', '0.55', '→ 0.89', 89],
              [jp ? '用紙占有率' : 'Coverage', '38%', '→ 96%', 96],
            ].map(([k, before, after, w], i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--rule)' : 'none' }}>
                <div className="row between">
                  <span className="label">{k}</span>
                  <span className="mono" style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--mute)' }}>{before}</span>{' '}
                    <b style={{ color: 'var(--accent)' }}>{after}</b>
                  </span>
                </div>
                <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${w}%` }} /></div>
              </div>
            ))}
          </div>
          {hasImages ? (
            <button className="btn accent" onClick={() => go('filter')}>
              {jp ? 'この結果で進む' : 'Accept & continue'} <span className="arrow">→</span>
            </button>
          ) : (
            <button className="btn ghost" onClick={() => go('upload')}>
              ↑ {jp ? '画像をアップロード' : 'Upload an image'}
            </button>
          )}
          <button className="btn ghost" onClick={() => go('adjust')}>
            ⊞ {jp ? '手動で微調整' : 'Fine-tune manually'}
          </button>
          <button className="btn ghost" onClick={() => go('upload')}>
            ← {jp ? '撮り直す' : 'Retake'}
          </button>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 06 · ADJUST
// ─────────────────────────────────────────────
function ScreenAdjust({ lang, go, resultImage }: { lang: Lang; go: (id: ScreenId) => void; resultImage: string | null }) {
  const jp = lang === 'jp';
  const [corners, setCorners] = useState([
    { x: 18, y: 12 }, { x: 88, y: 16 }, { x: 86, y: 92 }, { x: 14, y: 88 },
  ]);
  const [active, setActive] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (active === null || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    setCorners((c) => c.map((p, i) => i === active ? { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) } : p));
  }, [active]);

  useEffect(() => {
    if (active === null) return;
    const m = (e: MouseEvent | TouchEvent) => onMove(e);
    const u = () => setActive(null);
    window.addEventListener('mousemove', m);
    window.addEventListener('mouseup', u);
    window.addEventListener('touchmove', m);
    window.addEventListener('touchend', u);
    return () => {
      window.removeEventListener('mousemove', m);
      window.removeEventListener('mouseup', u);
      window.removeEventListener('touchmove', m);
      window.removeEventListener('touchend', u);
    };
  }, [active, onMove]);

  const reset = () => setCorners([{ x: 18, y: 12 }, { x: 88, y: 16 }, { x: 86, y: 92 }, { x: 14, y: 88 }]);
  const snap = () => setCorners([{ x: 8, y: 8 }, { x: 92, y: 8 }, { x: 92, y: 92 }, { x: 8, y: 92 }]);
  const poly = corners.map((c) => `${c.x},${c.y}`).join(' ');
  const cornerNames = jp
    ? ['左上 / TL', '右上 / TR', '右下 / BR', '左下 / BL']
    : ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-RIGHT', 'BOTTOM-LEFT'];

  return (
    <div className="screen reveal" data-screen-label="06 Adjust">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§06</span> {jp ? '手動調整 ／ FINE-TUNE' : 'FINE-TUNE'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '四隅を直接、紙の角に合わせます。' : 'Pin each corner to the page yourself.'}
          </h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={reset}>{jp ? '元に戻す' : 'Reset'}</button>
          <button className="btn ghost" onClick={snap}>⌂ {jp ? '外枠にスナップ' : 'Snap to frame'}</button>
        </div>
      </div>
      <div className="rule-thick" />

      <div className="capture-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28, marginTop: 24 }}>
        <div ref={stage} className="preview-canvas" style={{ position: 'relative', aspectRatio: '4/3', background: '#0c0c0a', overflow: 'hidden', cursor: active !== null ? 'grabbing' : 'default', userSelect: 'none' }}>
          {resultImage ? (
            <img src={`data:image/png;base64,${resultImage}`} alt="Adjust" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.6 }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, padding: 40 }}><SkewedDocMock intensity="soft" /></div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', pointerEvents: 'none' }} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <defs>
              <mask id="quadMask">
                <rect width="100" height="100" fill="white" />
                <polygon points={poly} fill="black" />
              </mask>
            </defs>
            <rect width="100" height="100" fill="rgba(10,10,10,.55)" mask="url(#quadMask)" />
            <polygon points={poly} fill="none" stroke="var(--accent)" strokeWidth="0.35" strokeDasharray="0.5 0.5" />
          </svg>
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,.85)' }}>
            <span>● MANUAL · CORNER-HANDLE</span>
            <span>QUAD · {corners.map((c) => `(${c.x.toFixed(0)},${c.y.toFixed(0)})`).join(' ')}</span>
          </div>
          {corners.map((c, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); setActive(i); }}
              onTouchStart={(e) => { e.preventDefault(); setActive(i); }}
              style={{
                position: 'absolute', left: `${c.x}%`, top: `${c.y}%`,
                transform: 'translate(-50%, -50%)', width: 28, height: 28,
                background: active === i ? 'var(--accent)' : 'rgba(255,255,255,.95)',
                border: '1.5px solid var(--accent)', borderRadius: '50%', cursor: 'grab',
                color: active === i ? 'var(--accent-ink)' : 'var(--accent)',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                display: 'grid', placeItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,.4)',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <aside className="col" style={{ gap: 14 }}>
          <div className="card" style={{ background: 'color-mix(in oklab, var(--accent) 8%, var(--bg))', borderColor: 'var(--accent)' }}>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 4 }}>METHOD</div>
            <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>{jp ? 'コーナーハンドル' : 'Corner handles'}</div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.45 }}>
              {jp ? 'つまみ点を、紙の角まで動かしてください。' : 'Drag the four handles onto the page corners.'}
            </p>
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{jp ? '四隅の座標' : 'Quad coordinates'}</div>
            <div className="col" style={{ gap: 6 }}>
              {corners.map((c, i) => (
                <div key={i} className="row between mono" style={{ fontSize: 11 }}>
                  <span style={{ color: 'var(--mute)' }}>{cornerNames[i]}</span>
                  <span>x={c.x.toFixed(1)} · y={c.y.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 6 }}>{jp ? '微調整キー' : 'KEYBOARD NUDGE'}</div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--mute)' }}>{jp ? '矢印キーで 1px、Shift で 10px。' : 'Arrow keys 1 px · Shift = 10 px.'}</p>
            <div className="row" style={{ gap: 6, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              {['←', '↑', '↓', '→', '⇧'].map((k) => (
                <span key={k} style={{ border: '1px solid var(--rule-strong)', padding: '3px 7px' }}>{k}</span>
              ))}
            </div>
          </div>
          <button className="btn accent" onClick={() => go('filter')}>
            {jp ? '結果を更新' : 'Apply update'} <span className="arrow">→</span>
          </button>
          <button className="btn ghost" onClick={() => go('compare')}>
            ← {jp ? '比較に戻る' : 'Back to compare'}
          </button>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 07 · FILTER
// ─────────────────────────────────────────────
const FILTER_PRESETS = [
  { id: 'original',   jp: 'オリジナル',       en: 'Original',    f: 'none', desc_jp: '撮ったまま',           desc_en: 'Untouched' },
  { id: 'magazine',   jp: '雑誌',             en: 'Magazine',    f: 'contrast(1.18) brightness(1.04) saturate(1.05)', desc_jp: '印刷物に近い深い黒', desc_en: 'Deep print-press blacks' },
  { id: 'paperwhite', jp: 'ホワイトペーパー', en: 'Paperwhite',  f: 'contrast(1.35) brightness(1.14) saturate(0.5)', desc_jp: '用紙を真っ白に整える', desc_en: 'Pure-white paper' },
  { id: 'mono',       jp: 'モノクロ',         en: 'B & W',       f: 'grayscale(1) contrast(1.22) brightness(1.05)', desc_jp: 'シャープな白黒', desc_en: 'Sharp monochrome' },
  { id: 'blueprint',  jp: 'ブループリント',   en: 'Blueprint',   f: 'grayscale(1) sepia(0.6) hue-rotate(180deg) saturate(3) contrast(1.1)', desc_jp: '図面風の青地', desc_en: 'Drafting cyan' },
  { id: 'amber',      jp: 'アンバー',         en: 'Amber',       f: 'sepia(0.6) contrast(1.12) brightness(1.04) saturate(1.2)', desc_jp: '原稿用紙の温かみ', desc_en: 'Manuscript warmth' },
];

function ScreenFilter({ lang, go, resultImage }: { lang: Lang; go: (id: ScreenId) => void; resultImage: string | null }) {
  const jp = lang === 'jp';
  const [preset, setPreset] = useState('paperwhite');
  const [bright, setBright] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [warm, setWarm] = useState(0);
  const [sharp, setSharp] = useState(0);

  const cur = FILTER_PRESETS.find((p) => p.id === preset)!;
  const filterStr = `${cur.f} brightness(${1 + bright / 200}) contrast(${1 + contrast / 200}) sepia(${Math.max(0, warm / 200)}) saturate(${1 + warm / 300})`;

  return (
    <div className="screen reveal" data-screen-label="07 Filters">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§07</span> {jp ? 'フィルター ／ FILTERS' : 'FILTERS'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '紙の質感に、もう一手間。' : 'A little more polish on the page.'}
          </h2>
        </div>
        <button className="btn ghost" onClick={() => { setBright(0); setContrast(0); setWarm(0); setSharp(0); setPreset('paperwhite'); }}>
          ↺ {jp ? 'リセット' : 'Reset'}
        </button>
      </div>
      <div className="rule-thick" />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, marginTop: 24 }}>
        <div>
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="label">★ {jp ? 'ライブプレビュー' : 'LIVE PREVIEW'}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{jp ? cur.jp : cur.en} · 100%</span>
          </div>
          <div className="preview-canvas" style={{ position: 'relative', aspectRatio: '4/3', background: 'color-mix(in oklab, var(--ink) 6%, var(--bg))', padding: 32, border: '1px solid var(--rule-strong)', overflow: 'hidden' }}>
            <div style={{ width: '62%', height: '100%', margin: '0 auto', filter: filterStr, transition: 'filter .25s' }}>
              {resultImage ? (
                <img src={`data:image/png;base64,${resultImage}`} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <DocPaperMock kind="essay" title="On Straightening" sub="FOLIO · FILTERED" />
              )}
            </div>
            <CornerBrackets color="var(--ink)" inset={12} size={22} weight={1.5} />
            <div style={{ position: 'absolute', bottom: 10, left: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)', letterSpacing: '0.1em' }}>
              FILTER · {cur.id.toUpperCase()} · BR{bright >= 0 ? '+' : ''}{bright}
            </div>
          </div>

          {/* Presets */}
          <div style={{ marginTop: 20 }}>
            <div className="label" style={{ marginBottom: 10 }}>{jp ? 'プリセット' : 'PRESETS'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {FILTER_PRESETS.map((p) => (
                <button key={p.id} onClick={() => setPreset(p.id)} style={{ appearance: 'none', padding: 6, border: `1px solid ${preset === p.id ? 'var(--accent)' : 'var(--rule-strong)'}`, background: preset === p.id ? 'color-mix(in oklab, var(--accent) 14%, var(--bg))' : 'var(--bg)', cursor: 'pointer', color: 'var(--ink)', textAlign: 'left' }}>
                  <div style={{ aspectRatio: '0.74', overflow: 'hidden', filter: p.f, marginBottom: 6, background: 'var(--paper)' }}>
                    <DocPaperMock kind="essay" title="—" />
                  </div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{jp ? p.jp : p.en}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 14 }}>TONE & GRAIN</div>
            {([[jp ? '明るさ' : 'Brightness', bright, setBright], [jp ? 'コントラスト' : 'Contrast', contrast, setContrast], [jp ? '色温度' : 'Warmth', warm, setWarm], [jp ? 'シャープネス' : 'Sharpness', sharp, setSharp]] as [string, number, (v: number) => void][]).map(([label, val, setter], i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: '1px solid var(--rule)' }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{label}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{val > 0 ? '+' : ''}{val}</span>
                </div>
                <input type="range" min={-50} max={50} step={1} value={val} onChange={(e) => setter(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
            ))}
          </div>
          <div className="card" style={{ background: 'color-mix(in oklab, var(--accent) 8%, var(--bg))', borderColor: 'var(--accent)' }}>
            <div className="label" style={{ color: 'var(--accent)' }}>★ {jp ? '編集のヒント' : "EDITOR'S NOTE"}</div>
            <p className="serif italic" style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.4 }}>
              {jp ? 'ノートは「ホワイトペーパー」、写真込みのレポートは「雑誌」が読みやすい。' : 'Notebook pages read best as Paperwhite. Mixed-photo essays prefer Magazine.'}
            </p>
          </div>
          <button className="btn accent lg full" onClick={() => go('export')}>
            {jp ? 'PDF 書き出しへ' : 'Continue to PDF'} <span className="arrow">→</span>
          </button>
          <button className="btn ghost" onClick={() => go('compare')}>← {jp ? 'Before/Afterに戻る' : 'Back to compare'}</button>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 08 · EXPORT
// ─────────────────────────────────────────────
function ScreenExport({ lang, go, resultImage }: { lang: Lang; go: (id: ScreenId) => void; resultImage: string | null }) {
  const jp = lang === 'jp';
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const runExport = () => {
    if (!resultImage) return;
    setExporting(true);
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = `data:image/${format};base64,${resultImage}`;
      a.download = `folio-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      setExporting(false);
      setDone(true);
    }, 600);
  };

  return (
    <div className="screen reveal" data-screen-label="08 Export">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§08</span> {jp ? '書き出し ／ EXPORT' : 'EXPORT'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? '補正した書類を保存する。' : 'Save the corrected document.'}
          </h2>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(['png', 'jpg'] as const).map((f) => (
            <button key={f} className={'tag' + (format === f ? ' solid' : '')} style={{ cursor: 'pointer' }} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="rule-thick" />

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32, marginTop: 24 }}>
        {/* Preview */}
        <div>
          <div className="label" style={{ marginBottom: 12 }}>{jp ? 'プレビュー' : 'PREVIEW'}</div>
          <div className="preview-canvas" style={{ position: 'relative', aspectRatio: '4/3', background: 'color-mix(in oklab, var(--ink) 4%, var(--bg))', border: '1px solid var(--rule-strong)', overflow: 'hidden', padding: 32 }}>
            {resultImage ? (
              <img src={`data:image/png;base64,${resultImage}`} alt="Export preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: '62%', height: '100%', margin: '0 auto' }}>
                <DocPaperMock kind="essay" title="Document" sub="READY TO EXPORT" />
              </div>
            )}
            <CornerBrackets color="var(--ink)" inset={12} size={22} weight={1.5} />
          </div>
          {done && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--ink)', color: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>
              <span className="mono" style={{ fontSize: 12, letterSpacing: '0.1em' }}>
                {jp ? '保存しました' : 'SAVED'} — folio-{new Date().toISOString().slice(0, 10)}.{format}
              </span>
            </div>
          )}
        </div>

        {/* Settings */}
        <aside className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{jp ? 'ファイル名' : 'FILENAME'}</div>
            <div className="mono" style={{ fontSize: 13, padding: '8px 10px', border: '1px dashed var(--rule-strong)' }}>
              folio-{new Date().toISOString().slice(0, 10)}.{format}
            </div>
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>{jp ? 'フォーマット' : 'FORMAT'}</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {(['png', 'jpg'] as const).map((f) => (
                <button key={f} className={'tag' + (format === f ? ' solid' : '')} style={{ cursor: 'pointer' }} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
              ))}
            </div>
            <div className="rule" style={{ margin: '12px 0' }} />
            <div className="row between">
              <span className="label">{jp ? '推定サイズ' : 'ESTIMATE'}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>≈ 2.4 MB</span>
            </div>
          </div>
          <button className="btn accent lg full" onClick={runExport} disabled={exporting || !resultImage} style={{ justifyContent: 'center' }}>
            {exporting ? (jp ? '★ 処理中…' : '★ Saving…') : done ? (jp ? '✓ 保存しました' : '✓ Saved') : (<>{jp ? 'ダウンロード' : 'Download'} <span className="arrow">→</span></>)}
          </button>
          {!resultImage && (
            <p className="serif italic" style={{ margin: 0, fontSize: 14, color: 'var(--mute)', textAlign: 'center' }}>
              {jp ? '補正する画像がありません' : 'No corrected image yet'}
            </p>
          )}
          <button className="btn ghost" onClick={() => go('filter')}>← {jp ? 'フィルターに戻る' : 'Back to filters'}</button>
          <button className="btn ghost" onClick={() => go('home')}>↩ {jp ? 'ホームへ' : 'Back to home'}</button>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 09 · HISTORY
// ─────────────────────────────────────────────
function ScreenHistory({ lang, go, history }: { lang: Lang; go: (id: ScreenId) => void; history: HistoryItem[] }) {
  const jp = lang === 'jp';
  const [search, setSearch] = useState('');

  const filtered = history.filter((item) => {
    const q = search.toLowerCase();
    return !q || item.status.includes(q);
  });

  return (
    <div className="screen reveal" data-screen-label="09 Archive">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="stack-sm">
          <div className="kicker"><span className="star">§09</span> {jp ? '履歴 ／ ARCHIVE' : 'ARCHIVE'}</div>
          <h2 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
            {jp ? 'これまでに、紙を真っ直ぐにした記録。' : 'Every paper, made readable.'}
          </h2>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <input
            placeholder={jp ? '検索…' : 'Search…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ appearance: 'none', border: '1px solid var(--rule-strong)', background: 'var(--bg)', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', width: 200, outline: 'none' }}
          />
          <button className="btn ghost" onClick={() => go('home')}>← {jp ? 'ホーム' : 'Home'}</button>
        </div>
      </div>
      <div className="rule-thick" />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', margin: '22px 0', border: '1px solid var(--rule-strong)' }}>
        {[
          [jp ? '処理済みページ' : 'Pages processed', history.filter((i) => i.status === 'success').length, '↑ latest'],
          [jp ? '総ファイル数' : 'Documents', history.length, jp ? '件' : 'items'],
          [jp ? '成功率' : 'Success rate', history.length > 0 ? `${Math.round((history.filter((i) => i.status === 'success').length / history.length) * 100)}%` : '—', '★ accuracy'],
          [jp ? '最終処理' : 'Last processed', history[0] ? new Date(history[0].created_at).toLocaleDateString('ja-JP') : '—', ''],
        ].map(([label, big, sub], i) => (
          <div key={i} style={{ padding: '18px 22px', borderLeft: i > 0 ? '1px solid var(--rule)' : 'none' }}>
            <div className="label" style={{ marginBottom: 6 }}>{label}</div>
            <div className="serif" style={{ fontSize: 40, lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{big}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, letterSpacing: '0.1em' }}>★ {sub}</div>
          </div>
        ))}
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="serif" style={{ fontSize: 32, color: 'var(--mute)', marginBottom: 12 }}>{jp ? 'まだ処理履歴がありません' : 'No documents yet'}</div>
          <button className="btn accent" onClick={() => go('upload')}>
            {jp ? '最初の書類を補正する' : 'Correct your first document'} <span className="arrow">→</span>
          </button>
        </div>
      ) : (
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="kicker"><span className="star">§</span> {jp ? '処理記録' : 'PROCESSING LOG'}</div>
            <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{filtered.length} {jp ? '件' : 'items'}</span>
          </div>
          <div className="rule" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {[jp ? 'ステータス' : 'Status', jp ? '日時' : 'Date', jp ? 'メッセージ' : 'Message', ''].map((c, i) => (
                  <th key={i} className="label" style={{ padding: '10px 8px', borderBottom: '1px solid var(--rule)', fontWeight: 500, textAlign: 'left' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '12px 8px' }}>
                    <span className={'tag' + (item.status === 'success' ? ' accent' : '')}>
                      {item.status === 'success' ? '✓ OK' : '✕ ERR'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }} className="mono">{new Date(item.created_at).toLocaleString('ja-JP')}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--mute)', fontSize: 13 }}>
                    {item.status === 'success' ? (jp ? '補正成功' : 'Correction successful') : (item.error_msg ?? 'Error')}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    <button className="tag" style={{ cursor: 'pointer', marginRight: 4 }} onClick={() => go('compare')}>↗ {jp ? '開く' : 'Open'}</button>
                    <button className="tag" style={{ cursor: 'pointer' }} onClick={() => go('export')}>⇣ {jp ? '再出力' : 'Export'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────
export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // App state
  const [active, setActive] = useState<ScreenId>('home');
  const [lang, setLang] = useState<Lang>('jp');
  const [theme, setTheme] = useState<ThemeId>('issue');

  // Data state
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);

  // Apply theme on mount and change
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Load usage + history on mount
  useEffect(() => {
    (async () => {
      try {
        const usageRes = await (await client.api.images.usage.$get()).json();
        if ('month' in usageRes) setUsage(usageRes as unknown as UsageInfo);
      } catch {}
      try {
        const histRes = await (await client.api.images.history.$get()).json();
        if ('history' in histRes) setHistory((histRes as unknown as { history: HistoryItem[] }).history);
      } catch {}
    })();
  }, []);

  // Keyboard nav 1-9
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= NAV_ITEMS.length) {
        setActive(NAV_ITEMS[idx - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (id: ScreenId) => {
    setActive(id);
    const main = document.querySelector('main.stage');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const cycleTheme = () => {
    const order: ThemeId[] = ['issue', 'studio', 'press'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const handleFile = (b64: string) => {
    setInputImage(b64);
    setResultImage(null);
  };

  const handleResult = (result: string, newUsage: UsageInfo) => {
    setResultImage(result);
    setUsage(newUsage);
    // Refresh history
    client.api.images.history.$get().then((r) => r.json() as Promise<unknown>).then((data) => {
      const d = data as Record<string, unknown>;
      if ('history' in d) setHistory(d.history as HistoryItem[]);
    }).catch(() => {});
  };

  const screenProps = { lang, go };

  const renderScreen = () => {
    switch (active) {
      case 'home':       return <ScreenHome       {...screenProps} usage={usage}         history={history} />;
      case 'capture':    return <ScreenCapture    {...screenProps} />;
      case 'upload':     return <ScreenUpload     {...screenProps} onFile={handleFile} />;
      case 'processing': return <ScreenProcessing {...screenProps} inputImage={inputImage} onResult={handleResult} />;
      case 'compare':    return <ScreenCompare    {...screenProps} inputImage={inputImage} resultImage={resultImage} />;
      case 'adjust':     return <ScreenAdjust     {...screenProps} resultImage={resultImage} />;
      case 'filter':     return <ScreenFilter     {...screenProps} resultImage={resultImage} />;
      case 'export':     return <ScreenExport     {...screenProps} resultImage={resultImage} />;
      case 'history':    return <ScreenHistory    {...screenProps} history={history} />;
      default:           return <ScreenHome       {...screenProps} usage={usage} history={history} />;
    }
  };

  return (
    <div className="folio-app density-regular">
      <Ticker lang={lang} setLang={setLang} theme={theme} onThemeClick={cycleTheme} />
      <SideNav active={active} setActive={go} lang={lang} historyCount={history.length} />
      <main className="stage" key={active}>
        {renderScreen()}
      </main>
      <FolioFoot active={active} lang={lang} />

      {/* User info strip */}
      <style>{`
        .user-strip {
          position: fixed; bottom: 52px; left: 0; width: 240px;
          padding: 10px 22px; border-top: 1px solid var(--rule);
          background: var(--bg); display: flex; align-items: center;
          justify-content: space-between; gap: 8px; z-index: 30;
          font-family: var(--font-mono); font-size: 10px; color: var(--mute);
          letter-spacing: 0.06em;
        }
        .user-strip button { appearance: none; border: 0; background: transparent; cursor: pointer; color: var(--mute); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; padding: 0; }
        .user-strip button:hover { color: var(--accent); }
        @media (max-width: 880px) { .user-strip { display: none; } }
      `}</style>
      <div className="user-strip">
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{user?.email}</span>
        <button onClick={handleLogout}>LOGOUT →</button>
      </div>
    </div>
  );
}

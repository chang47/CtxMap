import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type {
  ReportEnvelope,
  SessionReport,
  TopConsumer,
  BenchAggregate,
  BenchCell,
  Finding,
} from '../core/types';

// ---------------------------------------------------------------------------
// Formatting helpers (mirror the CLI formatters so numbers read identically)
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatCurrency(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function VerdictHeader({ r }: { r: SessionReport }) {
  const hasSubagents = (r.subagentCount ?? 0) > 0;
  return (
    <div className="stats">
      <div className="stat">
        <div className="label">Total cost</div>
        <div className="value accent">{formatCurrency(r.estimatedCost)}</div>
        {hasSubagents && (
          <div className="split">
            <span>main {formatCurrency(r.mainThreadCost ?? r.estimatedCost)}</span>
            <span>·</span>
            <span>+{r.subagentCount} subagents {formatCurrency(r.subagentCost ?? 0)}</span>
          </div>
        )}
      </div>
      <div className="stat">
        <div className="label">Peak context</div>
        <div className="value">
          {formatTokens(r.peakContext)} <small>/ {formatTokens(r.modelWindow)}</small>
        </div>
        <div className="split"><span>{formatPercent(r.peakContextPercent)} of window</span></div>
      </div>
      <div className="stat">
        <div className="label">Turns</div>
        <div className="value">{r.totalTurns.toLocaleString('en-US')}</div>
        {hasSubagents && <div className="split"><span>+{(r.subagentTurns ?? 0).toLocaleString('en-US')} subagent</span></div>}
      </div>
      <div className="stat">
        <div className="label">Model</div>
        <div className="value" style={{ fontSize: 18 }}>{r.primaryModel ?? 'Unknown'}</div>
      </div>
      <div className="stat">
        <div className="label">Duration</div>
        <div className="value" style={{ fontSize: 18 }}>{r.duration || '—'}</div>
      </div>
    </div>
  );
}

function FindingsPanel({ findings }: { findings: Finding[] }) {
  if (!findings || findings.length === 0) {
    return (
      <div className="panel">
        <h2>What to fix</h2>
        <div className="findings-clean">No inefficiencies flagged — nothing oversized, re-read, or cache-busting stood out.</div>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>What to fix — {findings.length} finding{findings.length === 1 ? '' : 's'}</h2>
      <div className="findings">
        {findings.map((f, i) => (
          <div className={`finding sev-${f.severity}`} key={i}>
            <div className="finding-head">
              <span className={`sev-chip sev-${f.severity}`}>{f.severity}</span>
              <span className="finding-title">{f.title}</span>
              {(f.wastedUsd || f.wastedTokens) && (
                <span className="finding-cost">
                  {f.wastedUsd ? `~${formatCurrency(f.wastedUsd)}` : `~${formatTokens(f.wastedTokens!)} tok`}
                </span>
              )}
            </div>
            <div className="finding-detail">{f.detail}</div>
            <div className="finding-fix"><span className="fix-label">fix</span> {f.fix}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhereTokensWent({ consumers }: { consumers: TopConsumer[] }) {
  const top = consumers.slice(0, 12);
  const max = Math.max(...top.map((c) => c.tokens), 1);
  if (top.length === 0) return null;
  return (
    <div className="panel">
      <h2>Where your tokens went — top consumers</h2>
      <div className="bars">
        {top.map((c, i) => (
          <div className="bar-row" key={i}>
            <div className="bar-cell">
              <div className="bar-label" title={c.description}>{c.description}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(c.tokens / max) * 100}%` }} />
              </div>
            </div>
            <div className="bar-num">{formatTokens(c.tokens)} tok</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextOverTime({ r }: { r: SessionReport }) {
  // Prefer the compact contextSeries (embedded reports strip segment.turns);
  // fall back to flattening segments when turns are present (e.g. direct use).
  let points: { turn: number; context: number }[] = r.contextSeries ?? [];
  if (points.length === 0) {
    for (const seg of r.segments) {
      for (const t of seg.turns) {
        points.push({ turn: t.turnIndex, context: t.contextTokens });
      }
    }
  }
  if (points.length < 2) return null;

  return (
    <div className="panel">
      <h2>Context over time — growth, compaction, regrowth</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="turn"
              stroke="var(--text-faint)"
              tick={{ fontSize: 11, fill: 'var(--text-faint)' }}
              tickLine={false}
              label={{ value: 'turn', position: 'insideBottomRight', offset: -2, fill: 'var(--text-faint)', fontSize: 11 }}
            />
            <YAxis
              stroke="var(--text-faint)"
              tick={{ fontSize: 11, fill: 'var(--text-faint)' }}
              tickLine={false}
              tickFormatter={(v: number) => formatTokens(v)}
              width={48}
            />
            <Tooltip
              contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--text-dim)' }}
              formatter={(v: number) => [formatTokens(v) + ' tokens', 'context']}
              labelFormatter={(l) => `turn ${l}`}
            />
            <ReferenceLine y={r.modelWindow} stroke="var(--bad)" strokeDasharray="4 4"
              label={{ value: `${r.primaryModel ?? ''} window`, fill: 'var(--bad)', fontSize: 10, position: 'insideTopRight' }} />
            {r.compactEvents.map((c, i) => (
              <ReferenceLine key={i} x={c.turnIndex} stroke="var(--accent-2)" strokeDasharray="2 3"
                label={{ value: '⚡', fontSize: 12, position: 'top' }} />
            ))}
            <Line type="monotone" dataKey="context" stroke="var(--accent)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ToolBreakdown({ r }: { r: SessionReport }) {
  const tools = r.toolStats.slice(0, 10);
  if (tools.length === 0) return null;
  return (
    <div className="panel">
      <h2>Tool breakdown</h2>
      <table className="grid">
        <thead>
          <tr><th>Tool</th><th style={{ textAlign: 'right' }}>Calls</th><th style={{ textAlign: 'right' }}>Context tokens</th><th style={{ textAlign: 'right' }}>% of session</th></tr>
        </thead>
        <tbody>
          {tools.map((t, i) => (
            <tr key={i}>
              <td className="name">{t.toolName}</td>
              <td className="num">{t.count.toLocaleString('en-US')}</td>
              <td className="num">{formatTokens(t.totalContextTokens)}</td>
              <td className="num">{formatPercent(t.percentOfSession)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaviestFiles({ r }: { r: SessionReport }) {
  const files = r.fileStats.slice(0, 10);
  if (files.length === 0) return null;
  return (
    <div className="panel">
      <h2>Heaviest files</h2>
      <table className="grid">
        <thead>
          <tr><th>File</th><th>Tool</th><th style={{ textAlign: 'right' }}>Reads</th><th style={{ textAlign: 'right' }}>Tokens</th></tr>
        </thead>
        <tbody>
          {files.map((f, i) => (
            <tr key={i}>
              <td className="name" title={f.filePath}>{f.filePath}</td>
              <td className="num" style={{ textAlign: 'left' }}>{f.toolName}</td>
              <td className="num">{f.count}</td>
              <td className="num">{formatTokens(f.totalTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionReportView({ r }: { r: SessionReport }) {
  return (
    <>
      <div className="sub">
        <span>{shortId(r.sessionId)}</span>
        <span className="dot">·</span>
        <span>{r.projectPath}</span>
      </div>
      <VerdictHeader r={r} />
      <div style={{ height: 18 }} />
      <FindingsPanel findings={r.findings} />
      <WhereTokensWent consumers={r.topConsumers} />
      <ContextOverTime r={r} />
      <ToolBreakdown r={r} />
      <HeaviestFiles r={r} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Aggregate lens — model × workflow benchmark (fork A)
// ---------------------------------------------------------------------------

function QualityBar({ cell }: { cell: BenchCell }) {
  const rated = cell.good + cell.ok + cell.bad;
  if (rated === 0) return <span className="q-unrated">unrated</span>;
  const pct = (n: number) => `${(n / rated) * 100}%`;
  return (
    <div className="qbar" title={`👍 ${cell.good}  👌 ${cell.ok}  👎 ${cell.bad}`}>
      {cell.good > 0 && <span className="q-good" style={{ width: pct(cell.good) }} />}
      {cell.ok > 0 && <span className="q-ok" style={{ width: pct(cell.ok) }} />}
      {cell.bad > 0 && <span className="q-bad" style={{ width: pct(cell.bad) }} />}
    </div>
  );
}

function BenchView({ agg }: { agg: BenchAggregate }) {
  const cellFor = (wf: string, model: string) =>
    agg.cells.find((c) => c.workflow === wf && c.model === model);

  return (
    <>
      <div className="sub">
        <span>model × workflow benchmark</span>
        <span className="dot">·</span>
        <span>{agg.totalRuns} tagged runs</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Tagged runs</div>
          <div className="value">{agg.totalRuns}</div>
        </div>
        <div className="stat">
          <div className="label">Workflows</div>
          <div className="value">{agg.workflows.length}</div>
        </div>
        <div className="stat">
          <div className="label">Models</div>
          <div className="value">{agg.models.length}</div>
        </div>
      </div>

      <div style={{ height: 18 }} />

      <div className="panel">
        <h2>Cost × quality — workflow (rows) by model (columns, cheapest first)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="grid matrix">
            <thead>
              <tr>
                <th>Workflow</th>
                {agg.models.map((m) => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {agg.workflows.map((wf) => (
                <tr key={wf}>
                  <td className="name">{wf}</td>
                  {agg.models.map((m) => {
                    const cell = cellFor(wf, m);
                    if (!cell) return <td key={m} className="num empty-cell">·</td>;
                    return (
                      <td key={m} className="num cell">
                        <div className="cell-cost">{formatCurrency(cell.avgCost)}</div>
                        <div className="cell-meta">{cell.runs} run{cell.runs === 1 ? '' : 's'} · peak {cell.avgPeakPercent.toFixed(0)}%</div>
                        <QualityBar cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="matrix-legend">
          <span><span className="swatch q-good" /> good</span>
          <span><span className="swatch q-ok" /> ok</span>
          <span><span className="swatch q-bad" /> bad</span>
          <span className="matrix-note">avg cost per run · same workflow across models answers "can a cheaper model hold quality?"</span>
        </div>
      </div>

      <div className="panel">
        <h2>Runs</h2>
        <table className="grid">
          <thead>
            <tr><th>Workflow</th><th>Model</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Turns</th><th style={{ textAlign: 'right' }}>Peak</th><th>Rating</th></tr>
          </thead>
          <tbody>
            {agg.rows.map((r) => (
              <tr key={r.sessionId}>
                <td className="name" style={{ textAlign: 'left' }}>{r.workflow}</td>
                <td className="num" style={{ textAlign: 'left' }}>{r.model}</td>
                <td className="num">{formatCurrency(r.cost)}</td>
                <td className="num">{r.turns.toLocaleString('en-US')}</td>
                <td className="num">{r.peakContextPercent.toFixed(0)}%</td>
                <td className="num" style={{ textAlign: 'left' }}>{r.rating ? { good: '👍 good', ok: '👌 ok', bad: '👎 bad' }[r.rating] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lens-agnostic shell — switch on envelope.kind
// ---------------------------------------------------------------------------

export function ReportApp({ envelope }: { envelope: ReportEnvelope | null }) {
  return (
    <div className="wrap">
      <div className="brand">
        <h1>CtxMap</h1>
        <span className="tag">token &amp; context receipt</span>
      </div>

      {!envelope ? (
        <div className="empty">
          No report data. Generate one with <code>ctxmap report</code>.
        </div>
      ) : envelope.kind === 'session' ? (
        <SessionReportView r={envelope.data as SessionReport} />
      ) : envelope.kind === 'aggregate' ? (
        <BenchView agg={envelope.data as BenchAggregate} />
      ) : (
        <div className="empty">
          The <code>{envelope.kind}</code> lens isn&apos;t rendered yet in this template.
        </div>
      )}

      {envelope && (
        <div className="foot">
          <span className="pill">{envelope.kind}</span>{' '}
          generated {new Date(envelope.generatedAt).toLocaleString()} · CtxMap v{envelope.ctxmapVersion}
        </div>
      )}
    </div>
  );
}

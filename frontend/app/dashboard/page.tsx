"use client";
import { useEffect, useState, useRef } from "react";
import {
  Payment, AgentStatus, TraceLog,
  fetchRecentPayments, fetchAgentStatuses, fetchTraceLogs,
  subscribeToPayments, subscribeToAgentStatus, subscribeToTraceLogs, supabase,
} from "@/lib/supabase";

// ── Verified Celo Sepolia token addresses ─────────────────────────────────────
const TOKEN_SYMBOLS: Record<string, string> = {
  "0xde9e4c3ce781b4ba68120d6261cbad65ce0ab00b": "USDm",
  "0xef4d55d6de8e8d73232827cd1e9b2f2dbb45bc80": "USDm",
  "0x3d5ae86f34e2a82771496d140daafaef3789df888": "NGNm",
  "0xc7e4635651e3e3af82b61d3e23c159438dae3bbf": "KESm",
  "0xa99dc247d6b7b2e3ab48a1fee101b83cd6acd82a": "EURm",
  "0x2294298942fdc79417de9e0d740a4957e0e7783a": "BRLm",
  "0x5505b70207ae3b826c1a7607f19f3bf73444a082": "XOFm",
  "0x5e94b8c872bd47bc4255e60ecbf44d5e66e7401c": "GHSm",
  "0x10ccfb235b0e1ed394bace4560c3ed016697687e": "ZARm",
  "0x471ece3750da237f93b8e339c536989b8978a438": "CELO",
  // mainnet
  "0x765de816845861e75a25fca122bb6898b8b1282a": "USDm",
  "0xe2702bd97ee33c88c8f6f92da3b733608aa76f71": "NGNm",
  "0x456a3d042c0dbd3db53d5489e98dfb038553b0d0": "KESm",
};
function sym(addr: string) { return TOKEN_SYMBOLS[addr?.toLowerCase()] ?? addr?.slice(0, 6) ?? "???"; }
function fmt(wei: string, dp = 2) {
  try { return parseFloat((Number(BigInt(wei)) / 1e18).toString()).toFixed(dp); }
  catch { return "0.00"; }
}

// ── Demo payment ──────────────────────────────────────────────────────────────
const DEMO_PAYMENT = {
  amount: "1000000000000000000",
  fromCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a",  // USDm mainnet
  toCurrency:   "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71",  // NGNm mainnet
  memo: "Freelance design work — June 2026",
};

const AGENT_ORDER = ["supervisor", "fx-router", "policy", "execution", "reconciliation"];
const AGENT_LABELS: Record<string, string> = {
  supervisor: "[01] SUPERVISOR", "fx-router": "[02] FX ROUTER",
  policy: "[03] POLICY", execution: "[04] EXECUTION", reconciliation: "[05] RECON",
};

export default function DashboardPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});
  const [traceLogs, setTraceLogs] = useState<TraceLog[]>([]);
  const [stats, setStats] = useState({ totalPayments: 0, volumeUSDm: "0", rank: "—" });
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoResult, setDemoResult] = useState<any>(null);
  const traceEndRef = useRef<HTMLDivElement>(null);
  const apiBase = process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:3001";
  const [taskInput, setTaskInput] = useState("");
  const explorerBase = process.env.NEXT_PUBLIC_CHAIN_ID === "42220"
    ? "https://celoscan.io"
    : "https://sepolia.celoscan.io";

  // Scheduling state
  const [scheduleForm, setScheduleForm] = useState({
    recipient: "", amountUSDm: "0.02", intervalHours: "0.01", memo: ""
  });
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<any>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchRecentPayments(20).then(setPayments);
    fetchAgentStatuses().then((list) => {
      const map: Record<string, AgentStatus> = {};
      list.forEach((a) => (map[a.agent_id] = a));
      setAgents(map);
    });
    fetchStats();
    fetchJobs();
  }, []);

  useEffect(() => {
    const ps = subscribeToPayments((p) => {
      setPayments((prev) => {
        const idx = prev.findIndex((x) => x.payment_id === p.payment_id);
        return idx >= 0 ? prev.map((x, i) => (i === idx ? p : x)) : [p, ...prev].slice(0, 20);
      });
    });
    const as = subscribeToAgentStatus((a) => setAgents((prev) => ({ ...prev, [a.agent_id]: a })));
    return () => { supabase.removeChannel(ps); supabase.removeChannel(as); };
  }, []);

  useEffect(() => {
    if (!activePaymentId) return;
    fetchTraceLogs(activePaymentId).then(setTraceLogs);
    const sub = subscribeToTraceLogs(activePaymentId, (log) =>
      setTraceLogs((prev) => [...prev, log])
    );
    return () => { supabase.removeChannel(sub); };
  }, [activePaymentId]);

  useEffect(() => { traceEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [traceLogs]);

  async function fetchStats() {
    try {
      const res = await fetch(`${apiBase}/api/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setStats({
        totalPayments: parseInt(data.totalPaymentsOffchain ?? "0"),
        volumeUSDm: fmt(data.totalVolumeUSDOnchain ?? "0", 2),
        rank: "—",
      });
    } catch {}
  }

  async function fetchJobs() {
    try {
      const res = await fetch(`${apiBase}/api/schedule`);
      const data = await res.json();
      setActiveJobs(data);
    } catch {}
  }

  async function cancelJob(jobId: string) {
    try {
      await fetch(`${apiBase}/api/schedule/${jobId}`, { method: "DELETE" });
      fetchJobs();
    } catch {}
  }

  async function triggerDemoPayment() {
    setIsDemoRunning(true);
    setDemoError(null);
    setDemoResult(null);
    setTraceLogs([]);
    const payload = {
      ...DEMO_PAYMENT,
      recipient: "0x1a36Dd233e173Ac256A39897C0eCd9993be4d33a",
      business: "0x1a36Dd233e173Ac256A39897C0eCd9993be4d33a",
    };
    try {
      const res = await fetch(`${apiBase}/api/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.paymentId) setActivePaymentId(data.paymentId);
      if (!res.ok) setDemoError(data.error ?? "Payment failed");
      else setDemoResult(data);
    } catch (err: any) {
      setDemoError(err.message);
    } finally {
      setIsDemoRunning(false);
      fetchStats();
    }
  }

  async function triggerTask() {
    if (!taskInput.trim()) return;
    setIsDemoRunning(true);
    setDemoError(null);
    setDemoResult(null);
    setTraceLogs([]);
    try {
      const res = await fetch(`${apiBase}/api/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: taskInput }),
      });
      const data = await res.json();
      if (data.paymentId) setActivePaymentId(data.paymentId);
      if (!res.ok) setDemoError(data.error ?? "Task failed");
      else { setDemoResult(data); setTaskInput(""); }
    } catch (err: any) {
      setDemoError(err.message);
    } finally {
      setIsDemoRunning(false);
      fetchStats();
    }
  }

  async function triggerSchedule() {
    setIsScheduling(true);
    setScheduleError(null);
    setScheduleResult(null);
    try {
      const res = await fetch(`${apiBase}/api/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientAddress: scheduleForm.recipient,
          amountUSDm: parseFloat(scheduleForm.amountUSDm),
          intervalHours: parseFloat(scheduleForm.intervalHours),
          memo: scheduleForm.memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) setScheduleError(data.error ?? "Schedule failed");
      else setScheduleResult(data);
    } catch (err: any) {
      setScheduleError(err.message);
    } finally {
      setIsScheduling(false);
      fetchJobs();
    }
  }

  const activeCount = Object.values(agents).filter(
    (a) => a.status === "active" || a.status === "executing"
  ).length;

  return (
    <div style={{ background: "var(--pf-black)", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "0.5px solid var(--pf-border)", paddingBottom: "16px", marginBottom: "24px"
      }}>
        <div>
          <span style={{ fontSize: "15px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em" }}>
            PayForge Orchestra
          </span>
          <span className="text-yellow" style={{ fontSize: "10px", marginLeft: "12px" }}>
            [FREELANCER AGENT] // CELO MAINNET
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span className={`pf-badge ${activeCount > 0 ? "pf-badge-live pulse-active" : "pf-badge-idle"}`}>
            [{activeCount > 0 ? "LIVE" : "IDLE"}] {activeCount}/5 ACTIVE
          </span>
          <a href="/config" className="pf-btn-secondary" style={{ padding: "6px 14px", fontSize: "10px" }}>CONFIG →</a>
        </div>
      </header>

      {/* Metrics */}
      <section style={{ marginBottom: "24px" }}>
        <div className="pf-section-label" style={{ marginBottom: "10px" }}>[01] // SYSTEM METRICS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {[
            { label: "Payments settled", value: stats.totalPayments.toString(), sub: "all time" },
            { label: "Volume (USDm)", value: `$${stats.volumeUSDm}`, sub: "onchain" },
            { label: "8004scan rank", value: stats.rank, sub: "by activity" },
            { label: "Agents live", value: `${Object.keys(agents).length}/5`, sub: "registered" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="pf-card">
              <div className="pf-section-label">{label}</div>
              <div className="pf-metric-value" style={{ marginTop: "6px" }}>{value}</div>
              <div className="pf-section-label" style={{ marginTop: "4px" }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Agent grid */}
      <section style={{ marginBottom: "24px" }}>
        <div className="pf-section-label" style={{ marginBottom: "10px" }}>[02] // AGENT STATUS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
          {AGENT_ORDER.map((key) => {
            const agent = agents[key];
            const statusColor =
              agent?.status === "executing" ? "var(--pf-green)"
              : agent?.status === "active" ? "var(--pf-yellow)"
              : agent?.status === "error" ? "var(--pf-red)"
              : "var(--pf-border)";
            return (
              <div key={key} className="pf-card" style={{ borderLeft: `2px solid ${statusColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="pf-section-label text-yellow">{AGENT_LABELS[key]}</span>
                  <span className={`pf-badge ${
                    agent?.status === "executing" ? "pf-badge-live"
                    : agent?.status === "active" ? "pf-badge-active"
                    : agent?.status === "error" ? "pf-badge-error"
                    : "pf-badge-idle"
                  }`}>[{(agent?.status ?? "OFFLINE").toUpperCase()}]</span>
                </div>
                <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 600 }}>
                  {key.replace("-", " ")}
                </div>
                <div className="pf-section-label" style={{ marginTop: "4px" }}>
                  ERC-8004 #{agent?.erc8004_agent_id ?? "—"} · {agent?.wallet_address ? agent.wallet_address.slice(0, 10) + "..." : "—"}
                </div>
                {agent?.last_action && (
                  <div className="text-muted pf-mono" style={{ marginTop: "8px", fontSize: "10px" }}>
                    → {agent.last_action.replace(/_/g, " ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Trace + Transactions */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>

        {/* Reasoning trace + task input */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div className="pf-section-label">[03] // LIVE REASONING TRACE</div>
            {activePaymentId && (
              <span className="text-muted pf-mono" style={{ fontSize: "10px" }}>{activePaymentId.slice(0, 8)}...</span>
            )}
          </div>
          <div className="pf-terminal">
            {traceLogs.length === 0 ? (
              <span className="text-muted cursor-blink">Give the agent a task below...</span>
            ) : traceLogs.map((log, i) => (
              <div key={log.id ?? i} style={{ marginBottom: "4px" }}
                className={
                  log.step.includes("settled") || log.step.includes("approved") || log.step.includes("confirmed") ? "pf-trace-ok"
                  : log.step.includes("error") || log.step.includes("fail") || log.step.includes("rejected") ? "pf-trace-error"
                  : "pf-trace-active"
                }>
                {log.step.includes("settled") || log.step.includes("confirmed") ? "✓" : "→"}{" "}
                [{new Date(log.timestamp).toLocaleTimeString()}]{" "}
                {AGENT_LABELS[log.agent_id] ?? log.agent_id}: {log.summary}
              </div>
            ))}
            <div ref={traceEndRef} />
          </div>

          {/* Natural language task input */}
          <div style={{ marginTop: "12px" }}>
            <div className="pf-section-label" style={{ marginBottom: "6px" }}>GIVE THE AGENT A TASK</div>
            <textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder={'e.g. "Pay 5 USDm to 0x1a36Dd... for invoice #123"\nor "Send 2 USDm to 0xABC... for design work"'}
              disabled={isDemoRunning}
              style={{
                width: "100%", background: "var(--pf-surface)", border: "0.5px solid var(--pf-border)",
                color: "#ffffff", fontFamily: "inherit", fontSize: "11px", padding: "10px 12px",
                outline: "none", resize: "vertical", minHeight: "70px",
                borderColor: taskInput ? "var(--pf-yellow)" : "var(--pf-border)",
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                className="pf-btn-primary"
                onClick={triggerTask}
                disabled={isDemoRunning || !taskInput.trim()}
                style={{ flex: 1 }}
              >
                {isDemoRunning ? "AGENTS RUNNING..." : "RUN AGENT TASK →"}
              </button>
              <button
                className="pf-btn-secondary"
                onClick={triggerDemoPayment}
                disabled={isDemoRunning}
                style={{ padding: "12px 16px", fontSize: "10px" }}
              >
                DEMO
              </button>
            </div>
          </div>

          {demoError && (
            <div className="text-red pf-mono" style={{ marginTop: "8px", fontSize: "10px" }}>✗ {demoError}</div>
          )}
          {demoResult && (
            <div className="pf-mono" style={{ marginTop: "8px", fontSize: "10px" }}>
              <div className="text-green">✓ Settled | Tx: <a href={`${explorerBase}/tx/${demoResult.txHash}`} target="_blank" rel="noopener noreferrer" className="text-yellow" style={{ textDecoration: "none" }}>{demoResult.txHash?.slice(0, 20)}...</a></div>
              {demoResult.fxRate && <div className="text-muted">Rate: 1 USDm = {demoResult.fxRate} NGNm</div>}
            </div>
          )}
        </div>

        {/* Transaction feed */}
        <div>
          <div className="pf-section-label" style={{ marginBottom: "10px" }}>[04] // RECENT TRANSACTIONS</div>
          <div className="pf-card" style={{ padding: 0 }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Tx hash</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={4} className="text-muted" style={{ textAlign: "center", padding: "20px" }}>No transactions yet</td></tr>
                ) : payments.slice(0, 10).map((p) => (
                  <tr key={p.payment_id}>
                    <td>
                      {p.tx_hash ? (
                        <a href={p.explorer_url ?? "#"} target="_blank" rel="noopener noreferrer"
                          className="text-yellow" style={{ textDecoration: "none" }}>
                          {p.tx_hash.slice(0, 10)}...
                        </a>
                      ) : <span className="text-muted">{p.payment_id.slice(0, 8)}...</span>}
                    </td>
                    <td className="text-white">{fmt(p.amount_in)} {sym(p.token_in)}</td>
                    <td className="text-white">{fmt(p.amount_out)} {sym(p.token_out)}</td>
                    <td>
                      <span className={`pf-badge ${
                        p.status === "settled" ? "pf-badge-live"
                        : p.status === "executing" ? "pf-badge-active"
                        : p.status === "failed" ? "pf-badge-error"
                        : "pf-badge-idle"
                      }`}>[{p.status.toUpperCase()}]</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Recurring payments */}
      <section style={{ marginBottom: "24px" }}>
        <div className="pf-section-label" style={{ marginBottom: "10px" }}>[05] // RECURRING PAYMENT</div>
        <div className="pf-card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div>
              <div className="pf-section-label" style={{ marginBottom: "4px" }}>RECIPIENT ADDRESS</div>
              <input
                value={scheduleForm.recipient}
                onChange={e => setScheduleForm(s => ({ ...s, recipient: e.target.value }))}
                placeholder="0x..."
                style={{ width: "100%", background: "var(--pf-surface)", border: "0.5px solid var(--pf-border)", color: "#fff", fontFamily: "inherit", fontSize: "11px", padding: "8px 10px", outline: "none" }}
              />
            </div>
            <div>
              <div className="pf-section-label" style={{ marginBottom: "4px" }}>MEMO</div>
              <input
                value={scheduleForm.memo}
                onChange={e => setScheduleForm(s => ({ ...s, memo: e.target.value }))}
                placeholder="monthly rent, invoice #123..."
                style={{ width: "100%", background: "var(--pf-surface)", border: "0.5px solid var(--pf-border)", color: "#fff", fontFamily: "inherit", fontSize: "11px", padding: "8px 10px", outline: "none" }}
              />
            </div>
            <div>
              <div className="pf-section-label" style={{ marginBottom: "4px" }}>AMOUNT (USDm)</div>
              <input
                value={scheduleForm.amountUSDm}
                onChange={e => setScheduleForm(s => ({ ...s, amountUSDm: e.target.value }))}
                type="number" step="0.01"
                style={{ width: "100%", background: "var(--pf-surface)", border: "0.5px solid var(--pf-border)", color: "#fff", fontFamily: "inherit", fontSize: "11px", padding: "8px 10px", outline: "none" }}
              />
            </div>
            <div>
              <div className="pf-section-label" style={{ marginBottom: "4px" }}>INTERVAL (HOURS) — 0.01 = 36s demo</div>
              <input
                value={scheduleForm.intervalHours}
                onChange={e => setScheduleForm(s => ({ ...s, intervalHours: e.target.value }))}
                type="number" step="0.01"
                style={{ width: "100%", background: "var(--pf-surface)", border: "0.5px solid var(--pf-border)", color: "#fff", fontFamily: "inherit", fontSize: "11px", padding: "8px 10px", outline: "none" }}
              />
            </div>
          </div>
          <button
            className="pf-btn-primary"
            onClick={triggerSchedule}
            disabled={isScheduling || !scheduleForm.recipient}
            style={{ width: "100%" }}
          >
            {isScheduling ? "SCHEDULING..." : "SCHEDULE RECURRING PAYMENT →"}
          </button>
          {scheduleError && (
            <div className="text-red pf-mono" style={{ marginTop: "8px", fontSize: "10px" }}>✗ {scheduleError}</div>
          )}
          {scheduleResult && (
            <div className="pf-mono" style={{ marginTop: "8px", fontSize: "10px" }}>
              <div className="text-green">✓ Scheduled | Job: {scheduleResult.jobId?.slice(0, 8)}... | Next: {new Date(scheduleResult.nextRun).toLocaleTimeString()}</div>
              <div className="text-muted">First payment: [{scheduleResult.firstPayment?.status}] {scheduleResult.firstPayment?.txHash?.slice(0, 20)}...</div>
            </div>
          )}
          {activeJobs.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div className="pf-section-label" style={{ marginBottom: "6px" }}>ACTIVE SCHEDULES</div>
              {activeJobs.map((job) => (
                <div key={job.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", background: "var(--pf-surface)",
                  border: "0.5px solid var(--pf-border)", marginBottom: "4px"
                }}>
                  <div className="pf-mono" style={{ fontSize: "10px" }}>
                    <span className="text-yellow">{job.amountUSDm} USDm</span>
                    <span className="text-muted"> → {job.recipientAddress?.slice(0, 10)}... | every {(job.intervalMs / 3600000).toFixed(2)}h | runs: {job.runCount} | next: {new Date(job.nextRun).toLocaleTimeString()}</span>
                  </div>
                  <button
                    onClick={() => cancelJob(job.id)}
                    style={{
                      background: "transparent", border: "0.5px solid var(--pf-red)",
                      color: "var(--pf-red)", fontSize: "10px", padding: "4px 8px",
                      cursor: "pointer", fontFamily: "inherit"
                    }}
                  >
                    CANCEL
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why PayForge wins */}
      <section style={{ marginBottom: "24px" }}>
        <div className="pf-section-label" style={{ marginBottom: "10px" }}>[06] // WHY PAYFORGE WINS</div>
        <div className="pf-card" style={{ padding: 0 }}>
          <table className="pf-table">
            <thead>
              <tr>
                <th style={{ width: "45%" }}>Feature</th>
                <th style={{ textAlign: "center" }}>PayForge</th>
                <th style={{ textAlign: "center" }}>Single-agent</th>
                <th style={{ textAlign: "center" }}>PayPal / Payoneer</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["5× ERC-8004 agents", true, false, false],
                ["USDm → NGNm via Mento (0.1% fee)", true, false, false],
                ["Onchain policy engine (unbypassable)", true, false, false],
                ["EAS attestation per payment", true, false, false],
                ["Live reasoning trace", true, false, false],
                ["No bank account required", true, true, false],
              ].map(([label, pf, single, trad]) => (
                <tr key={String(label)}>
                  <td className="text-muted">{String(label)}</td>
                  <td style={{ textAlign: "center" }} className={pf ? "text-yellow" : "text-muted"}>{pf ? "[✓]" : "[—]"}</td>
                  <td style={{ textAlign: "center" }} className={single ? "text-white" : "text-muted"}>{single ? "[✓]" : "[—]"}</td>
                  <td style={{ textAlign: "center" }} className={trad ? "text-white" : "text-muted"}>{trad ? "[✓]" : "[—]"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      

    </div>
  );
}

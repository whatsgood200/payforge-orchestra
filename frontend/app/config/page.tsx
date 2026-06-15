"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { isAddress, parseUnits, formatUnits } from "viem";

interface PolicyFormState {
  business: string;
  dailyLimit: string;
  maxSingleTx: string;
  minSingleTx: string;
  requiresApprovedRecipients: boolean;
  newRecipient: string;
  recipients: string[];
}

const DEFAULT_FORM: PolicyFormState = {
  business: "",
  dailyLimit: "1000",
  maxSingleTx: "500",
  minSingleTx: "1",
  requiresApprovedRecipients: false,
  newRecipient: "",
  recipients: [],
};

type SubmitStatus = "idle" | "loading" | "success" | "error";

export default function ConfigPage() {
  const [form, setForm] = useState<PolicyFormState>(DEFAULT_FORM);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitMsg, setSubmitMsg] = useState("");
  const [agentStatuses, setAgentStatuses] = useState<any[]>([]);
  const apiBase = process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    fetch(`${apiBase}/api/agents`)
      .then((r) => r.json())
      .then(setAgentStatuses)
      .catch(() => {});
  }, []);

  function set<K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addRecipient() {
    const addr = form.newRecipient.trim();
    if (!isAddress(addr)) {
      alert("Invalid Ethereum address");
      return;
    }
    if (form.recipients.includes(addr.toLowerCase())) return;
    set("recipients", [...form.recipients, addr.toLowerCase()]);
    set("newRecipient", "");
  }

  function removeRecipient(addr: string) {
    set("recipients", form.recipients.filter((r) => r !== addr));
  }

  // Validate form
  const formValid =
    isAddress(form.business) &&
    parseFloat(form.dailyLimit) > 0 &&
    parseFloat(form.maxSingleTx) > 0 &&
    parseFloat(form.maxSingleTx) <= parseFloat(form.dailyLimit) &&
    parseFloat(form.minSingleTx) >= 0;

  async function handleSubmit() {
    if (!formValid) return;
    setSubmitStatus("loading");
    setSubmitMsg("");

    try {
      const payload = {
        business: form.business,
        dailyLimit: parseUnits(form.dailyLimit, 18).toString(),
        maxSingleTx: parseUnits(form.maxSingleTx, 18).toString(),
        minSingleTx: parseUnits(form.minSingleTx || "0", 18).toString(),
        requiresApprovedRecipients: form.requiresApprovedRecipients,
        approvedRecipients: form.recipients,
      };

      const res = await fetch(`${apiBase}/api/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to configure policy");

      setSubmitStatus("success");
      setSubmitMsg(`Policy configured. Tx: ${data.txHash ?? "pending"}`);
    } catch (err: any) {
      setSubmitStatus("error");
      setSubmitMsg(err.message);
    }
  }

  return (
    <div style={{ background: "var(--pf-black)", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "0.5px solid var(--pf-border)", paddingBottom: "16px", marginBottom: "32px"
      }}>
        <div>
          <span style={{ fontSize: "15px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em" }}>
            PayForge Orchestra
          </span>
          <span className="text-yellow" style={{ fontSize: "10px", marginLeft: "12px" }}>
            [CONFIG]
          </span>
        </div>
        <Link href="/dashboard" className="pf-btn-secondary" style={{ padding: "6px 14px", fontSize: "10px", textDecoration: "none" }}>
          ← DASHBOARD
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", maxWidth: "1100px" }}>

        {/* Left — Policy config */}
        <div>
          <div className="pf-section-label" style={{ marginBottom: "20px" }}>[01] // CONFIGURE POLICY ENGINE</div>
          <div className="pf-card" style={{ padding: "24px" }}>

            {/* Business address */}
            <div style={{ marginBottom: "20px" }}>
              <label className="pf-section-label" style={{ display: "block", marginBottom: "6px" }}>
                Business wallet address
              </label>
              <input
                className="pf-input"
                type="text"
                placeholder="0x..."
                value={form.business}
                onChange={(e) => set("business", e.target.value)}
              />
              {form.business && !isAddress(form.business) && (
                <div className="text-red pf-mono" style={{ marginTop: "4px", fontSize: "10px" }}>
                  ✗ Invalid address
                </div>
              )}
            </div>

            {/* Daily limit */}
            <div style={{ marginBottom: "20px" }}>
              <label className="pf-section-label" style={{ display: "block", marginBottom: "6px" }}>
                Daily limit (USDm)
              </label>
              <input
                className="pf-input"
                type="number"
                min="1"
                step="1"
                placeholder="1000"
                value={form.dailyLimit}
                onChange={(e) => set("dailyLimit", e.target.value)}
              />
              <div className="text-muted pf-mono" style={{ marginTop: "4px", fontSize: "10px" }}>
                Max cumulative spend per 24h window
              </div>
            </div>

            {/* Max single tx */}
            <div style={{ marginBottom: "20px" }}>
              <label className="pf-section-label" style={{ display: "block", marginBottom: "6px" }}>
                Max per-transaction (USDm)
              </label>
              <input
                className="pf-input"
                type="number"
                min="1"
                step="1"
                placeholder="500"
                value={form.maxSingleTx}
                onChange={(e) => set("maxSingleTx", e.target.value)}
              />
              {parseFloat(form.maxSingleTx) > parseFloat(form.dailyLimit) && (
                <div className="text-red pf-mono" style={{ marginTop: "4px", fontSize: "10px" }}>
                  ✗ Cannot exceed daily limit
                </div>
              )}
            </div>

            {/* Min single tx */}
            <div style={{ marginBottom: "20px" }}>
              <label className="pf-section-label" style={{ display: "block", marginBottom: "6px" }}>
                Min per-transaction (USDm) — 0 for no minimum
              </label>
              <input
                className="pf-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="1"
                value={form.minSingleTx}
                onChange={(e) => set("minSingleTx", e.target.value)}
              />
            </div>

            {/* Recipient whitelist toggle */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.requiresApprovedRecipients}
                  onChange={(e) => set("requiresApprovedRecipients", e.target.checked)}
                  style={{ accentColor: "var(--pf-yellow)", width: "14px", height: "14px" }}
                />
                <span className="pf-section-label" style={{ color: "#cccccc" }}>
                  Require approved recipients whitelist
                </span>
              </label>
            </div>

            {/* Recipient whitelist */}
            {form.requiresApprovedRecipients && (
              <div style={{ marginBottom: "20px" }}>
                <label className="pf-section-label" style={{ display: "block", marginBottom: "8px" }}>
                  Approved recipients
                </label>
                {form.recipients.map((addr) => (
                  <div
                    key={addr}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", background: "var(--pf-surface2)", marginBottom: "4px",
                      border: "0.5px solid var(--pf-border)"
                    }}
                  >
                    <span className="pf-mono text-muted">{addr}</span>
                    <button
                      onClick={() => removeRecipient(addr)}
                      style={{ background: "none", border: "none", color: "var(--pf-red)", cursor: "pointer", fontSize: "11px" }}
                    >
                      [REMOVE]
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <input
                    className="pf-input"
                    type="text"
                    placeholder="0x..."
                    value={form.newRecipient}
                    onChange={(e) => set("newRecipient", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                    style={{ flex: 1 }}
                  />
                  <button className="pf-btn-secondary" onClick={addRecipient} style={{ whiteSpace: "nowrap" }}>
                    ADD
                  </button>
                </div>
              </div>
            )}

            {/* Submit */}
            <div style={{ marginTop: "24px", borderTop: "0.5px solid var(--pf-border)", paddingTop: "20px" }}>
              <button
                className="pf-btn-primary"
                onClick={handleSubmit}
                disabled={!formValid || submitStatus === "loading"}
                style={{ width: "100%" }}
              >
                {submitStatus === "loading"
                  ? "WRITING TO CHAIN..."
                  : "CONFIGURE POLICY ONCHAIN →"}
              </button>

              {submitStatus === "success" && (
                <div className="text-green pf-mono" style={{ marginTop: "12px", fontSize: "11px" }}>
                  ✓ {submitMsg}
                </div>
              )}
              {submitStatus === "error" && (
                <div className="text-red pf-mono" style={{ marginTop: "12px", fontSize: "11px" }}>
                  ✗ {submitMsg}
                </div>
              )}

              <div className="text-muted pf-mono" style={{ marginTop: "12px", fontSize: "10px" }}>
                This writes your policy directly to PolicyEngine.sol on Celo Mainnet.
                Hard limits are enforced at the contract level — agents cannot bypass them.
              </div>
            </div>
          </div>
        </div>

        {/* Right — Agent status + ERC-8004 info */}
        <div>
          <div className="pf-section-label" style={{ marginBottom: "20px" }}>[02] // AGENT REGISTRATIONS</div>
          <div className="pf-card" style={{ padding: 0 }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>ERC-8004 ID</th>
                  <th>Wallet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agentStatuses.length === 0
                  ? (
                    <tr>
                      <td colSpan={4} className="text-muted" style={{ textAlign: "center", padding: "24px" }}>
                        Loading agent data...
                      </td>
                    </tr>
                  )
                  : agentStatuses.map((a: any) => (
                    <tr key={a.agent_id}>
                      <td className="text-yellow uppercase">{a.agent_id}</td>
                      <td className="text-muted">
                        {a.erc8004_agent_id
                          ? <a
                              href={`https://8004scan.io/agent/${a.erc8004_agent_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-yellow"
                              style={{ textDecoration: "none" }}
                            >
                              #{a.erc8004_agent_id}
                            </a>
                          : "—"
                        }
                      </td>
                      <td className="text-muted pf-mono" style={{ fontSize: "10px" }}>
                        {a.wallet_address ? `${a.wallet_address.slice(0, 10)}...` : "—"}
                      </td>
                      <td>
                        <span className={`pf-badge ${
                          a.status === "idle" ? "pf-badge-live"
                          : a.status === "active" || a.status === "executing" ? "pf-badge-active"
                          : "pf-badge-error"
                        }`}>
                          [{a.status?.toUpperCase() ?? "—"}]
                        </span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {/* ERC-8004 links */}
          <div className="pf-section-label" style={{ margin: "24px 0 12px" }}>[03] // QUICK LINKS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              { label: "View agents on 8004scan", href: "https://8004scan.io" },
              { label: "Celo Explorer", href: "https://celoscan.io" },
              { label: "Mento Protocol Docs", href: "https://docs.mento.org" },
              { label: "ERC-8004 Spec", href: "https://docs.celo.org/build-on-celo/build-with-ai/8004" },
              { label: "x402 Thirdweb", href: "https://portal.thirdweb.com/x402" },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", background: "var(--pf-surface)",
                  border: "0.5px solid var(--pf-border)", textDecoration: "none",
                  transition: "border-color 0.1s"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--pf-yellow)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--pf-border)")}
              >
                <span className="pf-section-label" style={{ color: "#cccccc" }}>{label}</span>
                <span className="text-yellow" style={{ fontSize: "11px" }}>↗</span>
              </a>
            ))}
          </div>

          {/* Policy summary */}
          {formValid && (
            <div style={{ marginTop: "24px" }}>
              <div className="pf-section-label" style={{ marginBottom: "12px" }}>[04] // POLICY PREVIEW</div>
              <div className="pf-card pf-card-yellow">
                <div className="pf-mono" style={{ fontSize: "11px", lineHeight: "1.8" }}>
                  <div><span className="text-muted">Business:    </span>{form.business.slice(0, 18)}...</div>
                  <div><span className="text-muted">Daily limit: </span><span className="text-yellow">{form.dailyLimit} USDm</span></div>
                  <div><span className="text-muted">Max per tx:  </span><span className="text-yellow">{form.maxSingleTx} USDm</span></div>
                  <div><span className="text-muted">Min per tx:  </span>{form.minSingleTx || "0"} USDm</div>
                  <div><span className="text-muted">Whitelist:   </span>{form.requiresApprovedRecipients ? `${form.recipients.length} addresses` : "disabled"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function HomePage() {
  return (
    <div style={{ background: "var(--pf-black)", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 40px", borderBottom: "0.5px solid var(--pf-border)"
      }}>
        <span style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em" }}>
          ■ PAYFORGE
        </span>
        <div style={{ display: "flex", gap: "32px" }}>
          {[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Config", href: "/config" },
            { label: "Docs", href: "https://docs.celo.org/build-on-celo/build-with-ai/overview", external: true },
          ].map(({ label, href, external }) => (
            <Link key={label} href={href} target={external ? "_blank" : undefined}
              style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--pf-muted)", textDecoration: "none" }}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "80px 40px 60px" }}>
        <div style={{ maxWidth: "900px" }}>
          <div className="pf-section-label" style={{ marginBottom: "20px" }}>
            [LIVE] // FREELANCER PAYMENT AGENT ON CELO
          </div>
          <h1 className="pf-hero" style={{ color: "#ffffff", marginBottom: "8px" }}>
            INVOICE.<br />
            COLLECT.<br />
            <span className="text-yellow">SETTLE IN NGNm.</span>
          </h1>
          <p style={{
            marginTop: "32px", fontSize: "13px", color: "var(--pf-muted)",
            maxWidth: "600px", lineHeight: "1.8", textTransform: "uppercase", letterSpacing: "0.05em"
          }}>
            Nigerian freelancers get paid by global clients in USDm. Five autonomous agents
            route through Mento, convert to NGNm, attest every action onchain. No bank.
            No middleman. 0.1% fees vs 7–15% via PayPal.
          </p>
          <div style={{ marginTop: "40px", display: "flex", gap: "12px" }}>
            <Link href="/dashboard" className="pf-btn-primary"
              style={{ display: "inline-block", textDecoration: "none" }}>
              LAUNCH DASHBOARD →
            </Link>
            <Link href="/config" className="pf-btn-secondary"
              style={{ display: "inline-block", textDecoration: "none" }}>
              CONFIGURE AGENTS
            </Link>
          </div>
          <div style={{ marginTop: "24px" }}>
            <span className="pf-section-label">
              NO MIDDLEMAN // FULLY ONCHAIN // MENTO FX // ERC-8004 AGENTS // CELO MAINNET
            </span>
          </div>
        </div>
      </section>

      <div className="pf-divider" style={{ margin: "0 40px" }} />

      {/* The problem */}
      <section style={{ padding: "60px 40px" }}>
        <div className="pf-section-label" style={{ marginBottom: "24px" }}>[01] // THE PROBLEM</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px" }}>
          {[
            { stat: "7–15%", label: "Fee cut taken by PayPal / Payoneer on every freelancer payment" },
            { stat: "3–5 days", label: "Settlement time for international wire transfers to Nigerian accounts" },
            { stat: "$20B+", label: "African freelance economy bleeding to centralised payment rails annually" },
          ].map(({ stat, label }) => (
            <div key={stat} className="pf-card" style={{ padding: "28px 24px" }}>
              <div style={{ fontSize: "40px", fontWeight: 700, color: "var(--pf-yellow)", lineHeight: 1 }}>{stat}</div>
              <div className="text-muted" style={{ fontSize: "12px", lineHeight: "1.6", marginTop: "12px" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="pf-divider" style={{ margin: "0 40px" }} />

      {/* How it works */}
      <section style={{ padding: "60px 40px" }}>
        <div className="pf-section-label" style={{ marginBottom: "32px" }}>[02] // HOW IT WORKS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px" }}>
          {[
            { num: "01", title: "FREELANCER INVOICES CLIENT", desc: "Agent generates an onchain invoice. Client pays in USDm. Payment request hits the PayForge supervisor agent." },
            { num: "02", title: "AGENTS ROUTE + CONVERT", desc: "FX Router finds best USDm → NGNm rate on Mento. Policy Agent checks limits onchain. Execution Agent signs + broadcasts." },
            { num: "03", title: "FREELANCER RECEIVES NGNm", desc: "NGNm lands in wallet in seconds. Reconciliation Agent records an immutable attestation. Full audit trail onchain." },
          ].map(({ num, title, desc }) => (
            <div key={num} className="pf-card" style={{ padding: "32px 24px" }}>
              <div style={{ fontSize: "48px", fontWeight: 700, color: "var(--pf-yellow)", lineHeight: 1, marginBottom: "16px" }}>{num}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>{title}</div>
              <div className="text-muted" style={{ fontSize: "12px", lineHeight: "1.7" }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="pf-divider" style={{ margin: "0 40px" }} />

      {/* Corridors */}
      <section style={{ padding: "60px 40px" }}>
        <div className="pf-section-label" style={{ marginBottom: "24px" }}>[03] // SUPPORTED CORRIDORS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {[
            { from: "USDm", to: "NGNm", flag: "🇳🇬", label: "Nigeria", primary: true },
            { from: "USDm", to: "KESm", flag: "🇰🇪", label: "Kenya", primary: false },
            { from: "USDm", to: "GHSm", flag: "🇬🇭", label: "Ghana", primary: false },
            { from: "USDm", to: "ZARm", flag: "🇿🇦", label: "South Africa", primary: false },
          ].map(({ from, to, flag, label, primary }) => (
            <div key={to} className="pf-card" style={{ borderTop: `2px solid ${primary ? "var(--pf-yellow)" : "var(--pf-border)"}`, padding: "16px" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>{flag}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: primary ? "var(--pf-yellow)" : "#ffffff" }}>{label}</div>
              <div className="text-muted pf-mono" style={{ fontSize: "11px", marginTop: "6px" }}>{from} → {to}</div>
              {primary && <div className="text-yellow pf-mono" style={{ fontSize: "10px", marginTop: "4px" }}>[PRIMARY]</div>}
            </div>
          ))}
        </div>
        <div className="text-muted" style={{ fontSize: "11px", marginTop: "12px" }}>
          + EURm, BRLm, XOFm, KESm, COPm, PHPm, CADm, AUDm, CHFm, JPYm, GBPm — all routed via Mento Protocol
        </div>
      </section>

      <div className="pf-divider" style={{ margin: "0 40px" }} />

      {/* Tech stack */}
      <section style={{ padding: "60px 40px" }}>
        <div className="pf-section-label" style={{ marginBottom: "24px" }}>[04] // POWERED BY</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {[
            { name: "ERC-8004", desc: "5 autonomous agent wallets with onchain identity and reputation scoring.", color: "var(--pf-yellow)" },
            { name: "MENTO PROTOCOL", desc: "USDm → NGNm FX routing. 14+ African and global stablecoins.", color: "var(--pf-green)" },
            { name: "LANGGRAPH", desc: "Production multi-agent orchestration with typed shared state and retry logic.", color: "var(--pf-yellow)" },
            { name: "CELO MAINNET", desc: "Gas paid in USDm. Sub-second finality. 15M+ MiniPay users on MiniPay.", color: "var(--pf-green)" },
          ].map(({ name, desc, color }) => (
            <div key={name} className="pf-card" style={{ borderTop: `2px solid ${color}`, padding: "20px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "10px", color }}>{name}</div>
              <div className="text-muted" style={{ fontSize: "11px", lineHeight: "1.6" }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="pf-divider" style={{ margin: "0 40px" }} />

      <footer style={{ padding: "32px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pf-section-label">© 2026 PAYFORGE ORCHESTRA. BUILT FOR CELO ONCHAIN AGENTS HACKATHON #CELOAGENTS</span>
        <div style={{ display: "flex", gap: "24px" }}>
          {["8004scan", "Celoscan", "GitHub"].map((item) => (
            <span key={item} className="pf-section-label" style={{ cursor: "pointer" }}>{item}</span>
          ))}
        </div>
      </footer>

    </div>
  );
}

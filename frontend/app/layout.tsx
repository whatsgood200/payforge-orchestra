import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayForge Orchestra | Multi-Agent Payment System on Celo",
  description:
    "Autonomous multi-agent payment orchestration on Celo. " +
    "5 ERC-8004 agents, Mento FX routing, x402 micropayments, onchain policy engine.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

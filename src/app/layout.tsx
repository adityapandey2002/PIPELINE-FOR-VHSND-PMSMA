import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VHSND Offline Analytics Pipeline",
  description:
    "Offline-first ingestion, cleaning, visualization and reporting for VHSND supervision data. All processing happens locally in your browser; no data leaves this device.",
};

const CSP = [
  "default-src 'self'",
  // Next.js injects inline hydration/bootstrap scripts; a static offline app
  // cannot use nonces (no server), so inline must be permitted. Everything
  // else (remote origins, plugins) stays blocked.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "media-src 'self'",
  "worker-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body>{children}</body>
    </html>
  );
}
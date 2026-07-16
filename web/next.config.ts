import type { NextConfig } from "next";

// Baseline security response headers, applied to every route. These are
// defence-in-depth and non-breaking (no strict CSP, which would block the
// inline theme + analytics bootstrap scripts). Referrer-Policy in particular
// stops full URLs — including tokened/receipt links — leaking to third parties
// via the Referer header.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // clickjacking
  { key: "X-Content-Type-Options", value: "nosniff" }, // MIME sniffing
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;

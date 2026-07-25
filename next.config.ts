import type { NextConfig } from "next";

// SECURITY.md doesn't list HTTP response headers explicitly, but these are
// standard, low-risk hardening with no behavioral trade-off for this app:
// no third-party embedding is needed, so clickjacking/MIME-sniffing
// protections cost nothing to turn on.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // DECISIONS.md D10: puppeteer/puppeteer-core/@sparticuz/chromium ship native
  // binaries and large binary assets that must not be bundled by webpack/
  // Turbopack — they need to be required at runtime as real node_modules.
  serverExternalPackages: ["puppeteer", "puppeteer-core", "@sparticuz/chromium"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

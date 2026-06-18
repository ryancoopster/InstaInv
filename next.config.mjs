// SEC-5: the Content-Security-Policy is now emitted PER REQUEST from
// src/middleware.ts so it can carry a nonce and drop 'unsafe-inline' from
// script-src. The static, request-independent security headers stay here.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't leak the framework/version.
  poweredByHeader: false,
  // We run our own typecheck/lint in CI; don't block prototype builds on them.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    // Images are local uploads served from /uploads — no remote optimization, so
    // we drop the wildcard remotePatterns that widened the Image Optimizer's SSRF
    // surface. Add a specific allowlisted host here only if a CDN is introduced.
    remotePatterns: [],
  },
  // tesseract.js / bwip-js etc. should stay external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js", "bwip-js", "exceljs", "pdf-lib", "bcryptjs"],
    // Enables src/instrumentation.ts (used to start the background price-fetch scheduler).
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

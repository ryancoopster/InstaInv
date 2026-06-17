/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We run our own typecheck/lint in CI; don't block prototype builds on them.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // tesseract.js / bwip-js etc. should stay external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js", "bwip-js", "exceljs", "pdf-lib", "bcryptjs"],
  },
  // Allow large image/scan uploads to server actions / route handlers.
  async headers() {
    return [];
  },
};

export default nextConfig;

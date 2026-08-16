// Where the Next.js server proxies API and log requests to the Express backend.
// IMPORTANT: rewrites() is evaluated once during `next build` and baked into
// routes-manifest.json — production/standalone never re-reads it. So this is a
// BUILD-TIME value: for Docker, pass it as the SERVER_INTERNAL_URL build arg
// (Dockerfile.web sets it to http://server:3001). For a single-host deploy
// (LXC/`next start`) the localhost default is correct since the backend runs
// alongside on port 3001. Only `next dev` re-evaluates this on each start.
const serverInternalUrl = process.env.SERVER_INTERNAL_URL || 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Emit a self-contained server bundle (.next/standalone) for a small Docker image.
  output: 'standalone',
  experimental: {
    // The rewrite proxy kills connections after 30s by default. AI field
    // analysis through a local Ollama model can legitimately take minutes.
    proxyTimeout: 600_000
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${serverInternalUrl}/api/:path*`
      },
      {
        source: '/logs/:path*',
        destination: `${serverInternalUrl}/logs/:path*`
      }
    ];
  }
};

module.exports = nextConfig;

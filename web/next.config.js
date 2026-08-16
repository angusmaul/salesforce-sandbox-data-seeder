// Where the Next.js server proxies API and log requests. In a container/compose
// setup this is the backend service address (e.g. http://server:3001); it is read
// at server start, not baked into the build.
const serverInternalUrl = process.env.SERVER_INTERNAL_URL || 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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

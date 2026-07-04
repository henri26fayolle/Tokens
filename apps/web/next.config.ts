import type { NextConfig } from 'next';

/**
 * The web app talks to the api same-origin via rewrites (no CORS, first-party
 * cookies). Dev proxies to localhost:4000; production needs API_ORIGIN set on
 * Vercel once the api is hosted — until then /v1 and /api 404 and the UI
 * degrades to the logged-out landing.
 */
const apiOrigin =
  process.env.API_ORIGIN ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '');

const nextConfig: NextConfig = {
  transpilePackages: ['@kaiden/shared', '@kaiden/xp-config', '@kaiden/xp-engine'],
  async rewrites() {
    if (!apiOrigin) return [];
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` },
    ];
  },
};

export default nextConfig;

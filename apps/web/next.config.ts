import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@kaiden/shared', '@kaiden/xp-config', '@kaiden/xp-engine'],
};

export default nextConfig;

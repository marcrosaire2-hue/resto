import type { NextConfig } from 'next';

const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@plateforme/contracts'],
  poweredByHeader: false,
  // Même origine pour le navigateur : les cookies httpOnly de session passent par ce proxy.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      ],
    }];
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }] },
};

export default nextConfig;

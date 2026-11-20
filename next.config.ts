import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { agentUpgrade: 'security' },
  distDir: process.env.NEXT_OUTPUT_DIR || '.next',
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ['pdfkit', 'svg-to-pdfkit'],
  outputFileTracingIncludes: { '/api/orders/*/invoice': ['./assets/invoice/**/*', './public/images/vpb-logo.svg'] },
  async headers() {
    const isPayuSandbox = process.env.PAYU_ENV !== 'production';
    const payuFormTargets = isPayuSandbox
      ? 'https://test.payu.in https://secure.payu.in https://api.payu.in https://apitest.payu.in'
      : 'https://secure.payu.in https://api.payu.in';
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // Sandbox PayU domains are only included in non-production builds.
      { key: 'Content-Security-Policy', value: `object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' ${payuFormTargets}` },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ] }];
  },
  images: {
    // Product/site images render directly; the unused public optimizer is unnecessary.
    unoptimized: true,
    localPatterns: [],
    remotePatterns: [],
    deviceSizes: [320, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

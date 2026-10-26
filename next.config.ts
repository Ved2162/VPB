import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_OUTPUT_DIR || '.next',
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ['pdfkit', 'svg-to-pdfkit'],
  outputFileTracingIncludes: { '/api/orders/*/invoice': ['./assets/invoice/**/*', './public/images/vpb-logo.svg'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://test.payu.in https://secure.payu.in" },
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These values are intentionally public company identity/contact metadata.
  // Explicit keys let Next inline them in client components; dynamic
  // process.env[name] access is not transformed in browser bundles.
  env: {
    COMPANY_NAME: process.env.COMPANY_NAME,
    COMPANY_DOMAIN: process.env.COMPANY_DOMAIN,
    COMPANY_PHONE: process.env.COMPANY_PHONE,
    COMPANY_FROM_EMAIL: process.env.COMPANY_FROM_EMAIL,
    COMPANY_SHIPPING_EMAIL: process.env.COMPANY_SHIPPING_EMAIL,
    COMPANY_ADDRESS_LINE1: process.env.COMPANY_ADDRESS_LINE1,
    COMPANY_ADDRESS_CITY: process.env.COMPANY_ADDRESS_CITY,
    COMPANY_ADDRESS_STATE: process.env.COMPANY_ADDRESS_STATE,
    COMPANY_ADDRESS_ZIP: process.env.COMPANY_ADDRESS_ZIP,
    COMPANY_ADDRESS_COUNTRY: process.env.COMPANY_ADDRESS_COUNTRY,
    ZOHO_MAIL_ACCOUNT_ID: process.env.ZOHO_MAIL_ACCOUNT_ID,
    ZOHO_VOICE_FROM_NUMBER: process.env.ZOHO_VOICE_FROM_NUMBER,
  },
  // Produce a minimal Node.js server bundle that can run in Docker or on a VM.
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': [
      'public/product-images/**/*',
      'public/product-images/**',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      { protocol: 'https', hostname: '*.zoho.com' },
      { protocol: 'https', hostname: '*.zohostatic.com' },
      { protocol: 'https', hostname: '*.zohopublic.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/employee-login', destination: '/login?portal=employee', permanent: false },
      { source: '/admin-login', destination: '/login?portal=admin', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      {
        // Allow all API routes to be accessed cross-origin
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "https://titan-sales-portal.netlify.app" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      }
    ]
  }
};

export default nextConfig;

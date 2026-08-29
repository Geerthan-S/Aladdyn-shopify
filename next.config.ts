import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  isDevelopment ? "'unsafe-eval'" : "",
]
  .filter(Boolean)
  .join(" ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/chat": ["./src/lib/ai/rules/*.md"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.myshopify.com; object-src 'none'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;

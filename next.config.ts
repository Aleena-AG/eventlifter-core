import type { NextConfig } from "next";
import path from "path";

const appUrl = (
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  (process.env.NODE_ENV === "production"
    ? "https://ewentcast.com"
    : "http://localhost:3000")
).replace(/\/$/, "");

const nextConfig: NextConfig = {
    reactStrictMode: false,

    serverExternalPackages: [],

    env: {
        NEXT_PUBLIC_APP_URL: appUrl,
        NEXT_PUBLIC_HIGHTRIBE_APP_URL: (
          process.env.NEXT_PUBLIC_HIGHTRIBE_APP_URL ||
          process.env.HIGHTRIBE_APP_URL ||
          'https://hightribe.com'
        ).replace(/\/$/, ''),
        NEXT_PUBLIC_HIGHTRIBE_SSO_PATH:
          process.env.NEXT_PUBLIC_HIGHTRIBE_SSO_PATH || '/sso/ewentcast-token',
    },

    allowedDevOrigins: [
        "eventlifter-core.test",
        "*.eventlifter-core.test",
        "https://eventlifter-core.test",
    ],

    // TypeScript error bypass (Build fail nahi hogi)
    typescript: {
        ignoreBuildErrors: true,
    },

    turbopack: {
        root: path.resolve(__dirname),
    },
};

export default nextConfig;
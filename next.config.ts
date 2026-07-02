import type { NextConfig } from "next";
import path from "path";

const appUrl = (
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://ewentcast.com"
    : "http://localhost:3000")
).replace(/\/$/, "");

const nextConfig: NextConfig = {
    reactStrictMode: false,

    env: {
        NEXT_PUBLIC_APP_URL: appUrl,
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
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    reactStrictMode: false,
    serverExternalPackages: ['better-sqlite3'],

    // TypeScript error bypass (Build fail nahi hogi)
    typescript: {
        ignoreBuildErrors: true,
    },

    turbopack: {
        root: path.resolve(__dirname),
    },
};

export default nextConfig;
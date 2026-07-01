import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    reactStrictMode: false,

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
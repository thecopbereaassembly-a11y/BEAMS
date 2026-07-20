import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server Actions are the primary mutation path (see docs/07-api-design.md)
    typedRoutes: true,
  },
  images: {
    // Supabase Storage for member photos / documents (signed URLs)
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;

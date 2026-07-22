import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A package-lock.json exists in the parent directory, so Next would otherwise
  // infer the wrong workspace root. Pin it to this project.
  outputFileTracingRoot: __dirname,
  // typedRoutes is intentionally OFF until every module route exists (M1–M8).
  // With it on, navigation entries for not-yet-built modules fail typecheck.
  // Re-enable once the route surface is complete — it's a genuine safety net.
  images: {
    // Supabase Storage for member photos / documents (signed URLs)
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;

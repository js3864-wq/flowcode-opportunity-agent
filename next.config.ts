import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reports are read from data/ at request time, so ship that folder with the server bundle.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js route folders can't literally be named ".well-known" without
  // quirks, so the routes live under /api/well-known/* and get rewritten
  // to the real, spec-required paths.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy API requests to the backend in development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/:path*",
      },
    ];
  },
};

export default nextConfig;

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Disable image optimization for Firebase deployment
  images: { unoptimized: true },
};

export default nextConfig;

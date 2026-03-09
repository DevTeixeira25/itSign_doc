/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Static export for Firebase Hosting
  // In production, `pnpm build` outputs to `out/` folder
  // API calls use NEXT_PUBLIC_API_URL (empty string = same origin via Hosting rewrite)
  output: "export",

  // Disable image optimization (not supported with static export)
  images: { unoptimized: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow accessing the dev server (and its HMR resources) from other devices
  // on the LAN, e.g. testing on a phone at http://192.168.1.121:3000
  allowedDevOrigins: ["192.168.1.121"],
};

export default nextConfig;

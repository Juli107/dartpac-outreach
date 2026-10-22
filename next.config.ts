import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "nodemailer"],
};

export default nextConfig;

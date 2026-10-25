/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist", "pdfkit", "mailparser", "@anthropic-ai/sdk"],
  poweredByHeader: false,
};
export default nextConfig;

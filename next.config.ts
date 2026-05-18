import type { NextConfig } from "next";
import path from "node:path";

/** Turbopack otherwise walks up to `sweet/package-lock.json` and treats the wrong folder as the app root → 404 on all routes. */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  serverExternalPackages: ["sharp", "tesseract.js", "pdf-to-img", "pdf2pic"],
};

export default nextConfig;

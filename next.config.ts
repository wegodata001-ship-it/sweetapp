import type { NextConfig } from "next";
import path from "node:path";

/** Turbopack otherwise walks up to `sweet/package-lock.json` and treats the wrong folder as the app root → 404 on all routes. */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  serverExternalPackages: ["sharp", "pdfjs-dist", "@napi-rs/canvas"],
  /**
   * PDF fonts are read from disk at request time. Without tracing them the files are absent
   * from a serverless bundle and every PDF fails, so they are pinned to each route that can
   * generate one.
   */
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/lib/pdf/fonts/**"],
  },
};

export default nextConfig;

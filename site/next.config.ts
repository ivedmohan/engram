import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This site lives inside the engram monorepo, which has its own package-lock.json one level up —
  // without this, Turbopack guesses the wrong workspace root and may misresolve files, especially
  // once deployed (Vercel builds from a clean checkout, so this should be explicit, not inferred).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;

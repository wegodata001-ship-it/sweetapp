/**
 * Generates favicon + PWA icons from public/logo.png (cropped to dome/gold area).
 * Run: node scripts/generate-brand-icons.mjs
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const input = path.join(root, "public", "logo.png");

/** Focus crop on upper-center (dome + gold mark) */
async function cropLogo(size) {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;
  const cropSize = Math.round(Math.min(w, h) * 0.52);
  const left = Math.round((w - cropSize) / 2);
  const top = Math.round(h * 0.06);
  return sharp(input)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ quality: 90, compressionLevel: 9 });
}

const outputs = [
  { path: path.join(root, "src", "app", "icon.png"), size: 32 },
  { path: path.join(root, "src", "app", "apple-icon.png"), size: 180 },
  { path: path.join(root, "public", "icon-192.png"), size: 192 },
  { path: path.join(root, "public", "icon-512.png"), size: 512 },
];

for (const out of outputs) {
  await mkdir(path.dirname(out.path), { recursive: true });
  await (await cropLogo(out.size)).toFile(out.path);
  console.log("Wrote", out.path);
}

console.log("Brand icons generated.");

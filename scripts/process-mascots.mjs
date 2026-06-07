import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const files = fs
  .readdirSync(publicDir)
  .filter((f) => f.startsWith("mascot") && f.endsWith(".png"));

for (const file of files) {
  const filePath = path.join(publicDir, file);
  const image = sharp(filePath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  let changed = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 30 && data[i + 1] < 30 && data[i + 2] < 30) {
      data[i + 3] = 0;
      changed++;
    }
  }

  const tmpPath = filePath + ".tmp.png";
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(tmpPath);
  fs.renameSync(tmpPath, filePath);

  console.log(`${file}: made ${changed} pixels transparent`);
}

console.log("Done.");

import sharp from "sharp";
import path from "node:path";

const root = process.cwd();
const source = "C:\\Users\\titan\\Downloads\\LOGO NEW 2026 BLK.png";
const outputDir = path.join(root, "public");

const background = Buffer.from(`
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="42%" r="72%">
        <stop offset="0" stop-color="#292929"/>
        <stop offset="0.52" stop-color="#090909"/>
        <stop offset="1" stop-color="#000000"/>
      </radialGradient>
      <radialGradient id="ember" cx="50%" cy="48%" r="55%">
        <stop offset="0" stop-color="#ff7a00" stop-opacity="0.32"/>
        <stop offset="0.55" stop-color="#ff4d00" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#ff4d00" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb341"/>
        <stop offset="0.45" stop-color="#ff7900"/>
        <stop offset="1" stop-color="#b72e00"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
    <circle cx="512" cy="500" r="430" fill="url(#ember)"/>
    <rect x="35" y="35" width="954" height="954" rx="198" fill="none" stroke="url(#ring)" stroke-width="18"/>
    <rect x="58" y="58" width="908" height="908" rx="177" fill="none" stroke="#ff8a00" stroke-opacity="0.22" stroke-width="3"/>
  </svg>
`);

const helmet = await sharp(source)
  .extract({ left: 46, top: 12, width: 445, height: 688 })
  .resize({ width: 650, height: 790, fit: "inside", withoutEnlargement: false })
  .png()
  .toBuffer();

const master = await sharp(background)
  .composite([
    { input: helmet, gravity: "center" },
    {
      input: Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><path d="M234 842 C390 902 635 916 800 837" fill="none" stroke="#ff7900" stroke-width="16" stroke-linecap="round" opacity=".92"/><path d="M310 879 C447 920 616 922 735 884" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".42"/></svg>`),
    },
  ])
  .png()
  .toBuffer();

await sharp(master).toFile(path.join(outputDir, "titan-app-icon-1024.png"));
for (const size of [512, 192]) {
  await sharp(master).resize(size, size).png().toFile(path.join(outputDir, `titan-app-icon-${size}.png`));
}
await sharp(master).resize(180, 180).png().toFile(path.join(outputDir, "titan-apple-touch-icon.png"));

console.log("Generated Titan PWA icons in public/");

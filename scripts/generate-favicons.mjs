import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// Ensure public dir exists
mkdirSync(publicDir, { recursive: true });

// SVG with black background and white logo (ClawSignal claw logo)
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <g transform="translate(156, 140) scale(3.6)" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M52.8594,69.818l-14.8785-12.6467c-4.314,9.3216-15.3679,13.3811-24.6895,9.067S-.0897,50.8704,4.2244,41.5488c4.314-9.3216,15.3679-13.3811,24.6895-9.067,4.0016,1.8519,7.2151,5.0654,9.067,9.067l14.8785-12.6467"/>
    <path d="M5.495,24.8556c8.6867-8.8271,22.8845-8.9409,31.7116-.2542"/>
    <path d="M7.6735,13.1554c8.6051-6.9401,18.4353-7.0425,27.3548-.4924"/>
  </g>
</svg>`;

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generate() {
  const svgBuffer = Buffer.from(svgContent);
  
  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(publicDir, name));
    console.log(`✓ Generated ${name}`);
  }
  
  // Also create favicon.ico (use 32x32)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(join(publicDir, 'favicon.png'));
  console.log('✓ Generated favicon.png');
  
  console.log('\nDone! Favicons generated in public/');
}

generate().catch(console.error);

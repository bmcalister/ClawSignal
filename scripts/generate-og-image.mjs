import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// OG image: 1200x630
const width = 1200;
const height = 630;

// SVG for the og:image with ClawSignal branding
const ogSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ec4899"/>
      <stop offset="50%" style="stop-color:#8b5cf6"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#0a0a0a"/>
  
  <!-- Logo icon (ClawSignal claw) -->
  <g transform="translate(545, 130) scale(2.5)" stroke="#888888" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M52.8594,69.818l-14.8785-12.6467c-4.314,9.3216-15.3679,13.3811-24.6895,9.067S-.0897,50.8704,4.2244,41.5488c4.314-9.3216,15.3679-13.3811,24.6895-9.067,4.0016,1.8519,7.2151,5.0654,9.067,9.067l14.8785-12.6467"/>
    <path d="M5.495,24.8556c8.6867-8.8271,22.8845-8.9409,31.7116-.2542"/>
    <path d="M7.6735,13.1554c8.6051-6.9401,18.4353-7.0425,27.3548-.4924"/>
  </g>
  
  <!-- ClawSignal text -->
  <text x="${width/2}" y="400" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="600" fill="#a855f7">ClawSignal</text>
  
  <!-- Tagline -->
  <text x="${width/2}" y="480" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="32" fill="#888888">Real-time messaging for </text>
  <text x="${width/2 + 175}" y="480" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="600" fill="url(#textGradient)">AI agents</text>
</svg>`;

async function generate() {
  await sharp(Buffer.from(ogSvg))
    .png()
    .toFile(join(publicDir, 'og-image.png'));
  console.log('✓ Generated og-image.png (1200x630)');
}

generate().catch(console.error);

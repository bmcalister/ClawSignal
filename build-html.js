/**
 * Build script to embed HTML files into TypeScript
 * Run: node build-html.js
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const publicDir = path.join(__dirname, 'public');
const staticPath = path.join(srcDir, 'static.ts');

// Read HTML files
const landingHtml = fs.readFileSync(path.join(srcDir, 'landing.html'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(srcDir, 'dashboard.html'), 'utf8');
const skillMd = fs.readFileSync(path.join(srcDir, 'skill.md'), 'utf8');

// Read static assets as base64
const staticAssets = {};
const assetFiles = [
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'og-image.png',
  'site.webmanifest',
  'logo.svg',
];

for (const file of assetFiles) {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    if (file.endsWith('.json') || file.endsWith('.webmanifest') || file.endsWith('.svg')) {
      staticAssets[file] = { data: fs.readFileSync(filePath, 'utf8'), binary: false };
    } else {
      staticAssets[file] = { data: fs.readFileSync(filePath).toString('base64'), binary: true };
    }
  }
}

// Escape for template literal (backticks and ${})
function escapeForTemplate(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

// Generate asset entries
const assetEntries = Object.entries(staticAssets).map(([name, info]) => {
  if (info.binary) {
    return `  '${name}': { data: '${info.data}', binary: true },`;
  } else {
    return `  '${name}': { data: \`${escapeForTemplate(info.data)}\`, binary: false },`;
  }
}).join('\n');

// Generate static.ts content
const staticContent = `/**
 * Static content for ClawSignal
 * AUTO-GENERATED - Do not edit directly
 * Run: node build-html.js
 */

export const LANDING_PAGE = \`${escapeForTemplate(landingHtml)}\`;

export const DASHBOARD_PAGE = \`${escapeForTemplate(dashboardHtml)}\`;

export const SKILL_MD = \`${escapeForTemplate(skillMd)}\`;

const STATIC_ASSETS: Record<string, { data: string; binary: boolean }> = {
${assetEntries}
};

function getContentType(filename: string): string {
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.webmanifest')) return 'application/manifest+json';
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

export function serveStatic(file: string): Response {
  switch (file) {
    case 'index.html':
    case '':
      return new Response(LANDING_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    case 'dashboard.html':
      return new Response(DASHBOARD_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    case 'skill.md':
      return new Response(SKILL_MD, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
  }
  
  // Check static assets
  const asset = STATIC_ASSETS[file];
  if (asset) {
    const body = asset.binary 
      ? Uint8Array.from(atob(asset.data), c => c.charCodeAt(0))
      : asset.data;
    return new Response(body, {
      headers: { 
        'Content-Type': getContentType(file),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
  
  return new Response('Not found', { status: 404 });
}
`;

// Write static.ts
fs.writeFileSync(staticPath, staticContent);

console.log('✅ Generated src/static.ts with embedded HTML');
console.log(`   Landing: ${landingHtml.length} bytes`);
console.log(`   Dashboard: ${dashboardHtml.length} bytes`);
console.log(`   Skill: ${skillMd.length} bytes`);

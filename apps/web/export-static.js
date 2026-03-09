/**
 * Script to create a static `out/` directory from the default Next.js build.
 * Copies HTML files and static assets so Firebase Hosting can serve them.
 */
const fs = require('fs');
const path = require('path');

const webDir = __dirname;
const dotNext = path.join(webDir, '.next');
const outDir = path.join(webDir, 'out');

// Clean out directory
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 1. Copy static HTML pages from .next/server/app/
const serverApp = path.join(dotNext, 'server', 'app');

function copyHtmlFiles(srcDir, destDir, relativePath = '') {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      // Skip [param] directories — dynamic routes handled by SPA fallback
      if (entry.name.startsWith('[')) continue;
      copyHtmlFiles(srcPath, destDir, path.join(relativePath, entry.name));
    } else if (entry.name.endsWith('.html')) {
      let destPath;
      if (entry.name === 'index.html' && relativePath === '') {
        // Root index.html
        destPath = path.join(destDir, 'index.html');
      } else {
        // e.g. dashboard.html -> dashboard/index.html
        const baseName = entry.name.replace('.html', '');
        const dir = path.join(destDir, relativePath, baseName);
        fs.mkdirSync(dir, { recursive: true });
        destPath = path.join(dir, 'index.html');
      }
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ${relativePath ? relativePath + '/' : ''}${entry.name} -> ${path.relative(outDir, destPath)}`);
    }
  }
}

console.log('Copying HTML pages...');
copyHtmlFiles(serverApp, outDir);

// Also copy root index.html as 404.html for SPA fallback
const indexHtml = path.join(outDir, 'index.html');
const notFoundSrc = path.join(serverApp, '_not-found.html');
if (fs.existsSync(notFoundSrc)) {
  fs.copyFileSync(notFoundSrc, path.join(outDir, '404.html'));
  console.log('  _not-found.html -> 404.html');
}

// 2. Copy _next/static/ directory
const staticSrc = path.join(dotNext, 'static');
const staticDest = path.join(outDir, '_next', 'static');

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying _next/static/...');
copyDirRecursive(staticSrc, staticDest);

// 3. Copy BUILD_ID
const buildId = path.join(dotNext, 'BUILD_ID');
if (fs.existsSync(buildId)) {
  const buildIdDest = path.join(outDir, '_next', 'BUILD_ID');
  fs.copyFileSync(buildId, buildIdDest);
}

// Count files
let fileCount = 0;
function countFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
    else fileCount++;
  }
}
countFiles(outDir);

console.log(`\nDone! ${fileCount} files in out/`);

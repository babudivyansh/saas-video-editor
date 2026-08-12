// Plain CommonJS — invoked directly via `node scripts/postbuild.js`, not
// bundled/transpiled, so this can't be switched to ESM imports.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

// This script IS the static-asset deploy step on Hostinger (it copies the
// freshly built chunks to the standalone server dir and to public_html, which
// the hcdn CDN serves from). Its previous version wrapped every copy in a
// try/catch that logged and CONTINUED — so a copy that failed or completed
// partially (an OOM-killed build, a disk-quota stop, a locked file) still exited
// 0 and shipped. The result seen in prod: the server's HTML referenced chunks
// like `turbopack-*.js` that were never actually on disk, every one 404'd, the
// client bundle never executed, and the whole dashboard sat frozen on skeletons.
//
// So the rule here is now: a static copy that is not provably complete FAILS the
// build (exit 1). Better a red deploy than a live site that can't hydrate.

/** Recursively list every file under `dir` as { rel, size }. */
function listFiles(dir) {
  const out = [];
  (function walk(current, base) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.join(base, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.push({ rel, size: fs.statSync(full).size });
    }
  })(dir, '');
  return out;
}

/**
 * Assert every file under `srcDir` exists under `destDir` with an identical byte
 * size. Throws (which aborts the build) on any missing or truncated file. Extra
 * files already in destDir are fine — we only assert the source is fully
 * represented. Returns the number of files verified.
 */
function verifyComplete(srcDir, destDir, label) {
  const srcFiles = listFiles(srcDir);
  const missing = [];
  const truncated = [];
  for (const f of srcFiles) {
    const destPath = path.join(destDir, f.rel);
    if (!fs.existsSync(destPath)) missing.push(f.rel);
    else if (fs.statSync(destPath).size !== f.size) truncated.push(f.rel);
  }

  if (missing.length || truncated.length) {
    console.error(
      `❌ ${label}: copy INCOMPLETE — ${missing.length} missing, ${truncated.length} truncated of ${srcFiles.length} files.`,
    );
    for (const m of missing.slice(0, 15)) console.error('   missing:   ' + m);
    for (const m of truncated.slice(0, 15)) console.error('   truncated: ' + m);
    throw new Error(
      `${label}: static asset copy is incomplete — refusing to ship a deploy whose chunks 404 at runtime.`,
    );
  }
  return srcFiles.length;
}

/**
 * Copy `srcDir` -> `destDir`, then verify the copy is complete. Throws if not.
 */
function copyAndVerify(srcDir, destDir, label) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true, force: true });
  const count = verifyComplete(srcDir, destDir, label);
  console.log(`✅ ${label}: ${count} files copied and verified -> ${destDir}`);
}

/**
 * Restore the execute bit on bundled binaries in the standalone output.
 *
 * ffmpeg-static and youtube-dl-exec ship their binaries +x, but Next's
 * output-file tracing (and the subsequent copy) does not reliably preserve the
 * mode — clipiro.com's deploy landed the ffmpeg binary non-executable, so every
 * spawn failed with EACCES and took down all rendering. lib/ensure-executable
 * also fixes this at runtime, but setting it here means the shipped artifact is
 * already correct. Best-effort: skipped on Windows and never fatal.
 */
function ensureBinariesExecutable() {
  if (process.platform === 'win32') return;
  const bins = [
    '.next/standalone/node_modules/ffmpeg-static/ffmpeg',
    '.next/standalone/node_modules/youtube-dl-exec/bin/yt-dlp',
  ];
  for (const b of bins) {
    try {
      if (fs.existsSync(b)) { fs.chmodSync(b, 0o755); console.log('✅ chmod +x ' + b); }
    } catch (err) {
      console.warn('⚠️ Could not chmod ' + b + ' (runtime will retry):', err.message);
    }
  }
}

function main() {
  console.log('--- Running Custom Postbuild Asset Copy ---');
  ensureBinariesExecutable();

  // 1. Standalone server dir — the Node process serves /_next/static from here,
  //    so an incomplete copy here is fatal.
  if (fs.existsSync('public')) copyAndVerify('public', '.next/standalone/public', 'standalone public/');
  if (!fs.existsSync('.next/static')) {
    throw new Error('.next/static is missing — did `next build` actually run?');
  }
  copyAndVerify('.next/static', '.next/standalone/.next/static', 'standalone .next/static/');

  // .env is best-effort (secrets may be injected by the platform instead) — a
  // missing .env is not a broken deploy, so this one stays non-fatal.
  if (fs.existsSync('.env')) {
    try {
      fs.copyFileSync('.env', '.next/standalone/.env');
      console.log('✅ Copied .env -> .next/standalone/.env');
    } catch (err) {
      console.warn('⚠️ Could not copy .env (continuing):', err.message);
    }
  }

  // 2. public_html — where hcdn serves static assets from directly. If a real
  //    public_html exists, its copy must also be complete (this is exactly the
  //    path that shipped missing chunks before), so verification here is fatal too.
  const possiblePublicHtmlDirs = [
    '/home/u154310472/domains/clipiro.com/public_html',
    path.resolve(process.cwd(), '../public_html'),
    path.resolve(process.cwd(), '../../public_html'),
    path.resolve(process.cwd(), '../../../public_html'),
    path.resolve(process.cwd(), '../public'),
  ];

  let copiedToPublicHtml = false;
  for (const p of possiblePublicHtmlDirs) {
    if (!fs.existsSync(p)) continue;
    // Never treat our own source public/ as a deploy target.
    if (path.resolve(p) === path.resolve('public')) continue;

    console.log('🔍 Found target deployment folder at:', p);
    if (fs.existsSync('public')) copyAndVerify('public', p, `public_html public/ (${p})`);
    copyAndVerify('.next/static', path.join(p, '_next', 'static'), `public_html _next/static/ (${p})`);
    copiedToPublicHtml = true;
  }

  if (!copiedToPublicHtml) {
    console.log('ℹ️ No public_html/ folder detected nearby. Standalone copy complete.');
  } else {
    console.log('🎉 Static assets copied and verified for direct web-server access.');
  }
}

// Guarded so the pure helpers can be unit-tested without running the copy.
if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('💥 Postbuild failed:', err.message);
    process.exit(1);
  }
}

module.exports = { listFiles, verifyComplete, copyAndVerify, ensureBinariesExecutable };

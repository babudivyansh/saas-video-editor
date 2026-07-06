const fs = require('fs');
const path = require('path');

console.log('--- Running Custom Postbuild Asset Copy ---');

// 1. Copy to standalone directory for Next.js server
try {
  const standalonePublic = '.next/standalone/public';
  const standaloneStatic = '.next/standalone/.next/static';
  
  if (fs.existsSync('public')) {
    fs.mkdirSync(standalonePublic, { recursive: true });
    fs.cpSync('public', standalonePublic, { recursive: true, force: true });
    console.log('✅ Copied public/ -> ' + standalonePublic);
  }
  
  if (fs.existsSync('.next/static')) {
    fs.mkdirSync(standaloneStatic, { recursive: true });
    fs.cpSync('.next/static', standaloneStatic, { recursive: true, force: true });
    console.log('✅ Copied .next/static/ -> ' + standaloneStatic);
  }
  
  if (fs.existsSync('.env')) {
    fs.copyFileSync('.env', '.next/standalone/.env');
    console.log('✅ Copied .env -> .next/standalone/.env');
  }
} catch (err) {
  console.error('⚠️ Error copying to standalone directory:', err.message);
}

// 2. Copy to public_html directory for Apache/Nginx direct serving
const possiblePublicHtmlDirs = [
  '/home/u154310472/domains/clipiro.com/public_html',
  path.resolve(process.cwd(), '../public_html'),
  path.resolve(process.cwd(), '../../public_html'),
  path.resolve(process.cwd(), '../../../public_html'),
  path.resolve(process.cwd(), '../public'), // sometimes mapped to '../public'
];

let copiedToPublicHtml = false;

for (const p of possiblePublicHtmlDirs) {
  try {
    if (fs.existsSync(p)) {
      // Avoid copying into our own local public folder
      if (path.resolve(p) === path.resolve('public')) {
        continue;
      }
      
      console.log('🔍 Found target deployment folder at:', p);
      
      // Copy public/ content to public_html/
      if (fs.existsSync('public')) {
        fs.cpSync('public', p, { recursive: true, force: true });
        console.log('✅ Copied public/ contents -> ' + p);
      }
      
      // Copy .next/static/ to public_html/_next/static/
      const nextStaticDst = path.join(p, '_next', 'static');
      fs.mkdirSync(nextStaticDst, { recursive: true });
      if (fs.existsSync('.next/static')) {
        fs.cpSync('.next/static', nextStaticDst, { recursive: true, force: true });
        console.log('✅ Copied .next/static/ -> ' + nextStaticDst);
      }
      copiedToPublicHtml = true;
    }
  } catch (err) {
    console.error('⚠️ Error copying to ' + p + ':', err.message);
  }
}

if (!copiedToPublicHtml) {
  console.log('ℹ️ No public_html/ folder detected nearby. Standard standalone copy complete.');
} else {
  console.log('🎉 Successfully copied assets for direct web server access!');
}

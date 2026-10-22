// Build: concatenate src/*.js (in filename order) into one inline module script.
// Outputs dist/index.html (page body for publishing as an Artifact; the host adds the skeleton)
// and dist/forest-cabin.html (standalone page with its own skeleton, opens directly in a browser).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');
mkdirSync(distDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
const script = files
  .map((f) => `// ── ${f} ${'─'.repeat(Math.max(4, 60 - f.length))}\n${readFileSync(join(srcDir, f), 'utf8').trim()}\n`)
  .join('\n');

// Syntax check the module before writing pages.
const checkPath = join(distDir, '.check.mjs');
writeFileSync(checkPath, script);
try {
  execFileSync(process.execPath, ['--check', checkPath], { stdio: 'inherit' });
} finally {
  rmSync(checkPath, { force: true });
}

const template = readFileSync(join(root, 'template.html'), 'utf8');
if (!template.includes('/*__SCRIPT__*/')) throw new Error('template is missing the script placeholder');
const body = template.replace('/*__SCRIPT__*/', () => script);
writeFileSync(join(distDir, 'index.html'), body);

const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync(join(distDir, 'forest-cabin.html'), standalone);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1);
console.log(`built ${files.length} modules · script ${kb(script)} KB · page ${kb(body)} KB`);

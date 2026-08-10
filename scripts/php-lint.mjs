import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function resolvePhpExe() {
  const candidate = process.env.ADACHAT_PHP || 'php'
  return candidate
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      walk(p, out)
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.php')) {
      out.push(p)
    }
  }
  return out
}

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd())
const phpExe = resolvePhpExe()

const files = walk(root)
if (files.length === 0) {
  console.log('No PHP files found.')
  process.exit(0)
}

// Proactively detect missing php executable (ENOENT)
{
  const probe = spawnSync(phpExe, ['-v'], { encoding: 'utf8' })
  if (probe.error && probe.error.code === 'ENOENT') {
    console.error(
      [
        '[php-lint] PHP executable not found.',
        'Please install PHP and ensure `php` is in PATH, or set ADACHAT_PHP to php.exe/php binary.',
        'Examples:',
        '  setx ADACHAT_PHP "C:\\path\\to\\php.exe"   (Windows)',
        '  export ADACHAT_PHP=/usr/bin/php            (Linux/macOS)',
      ].join('\n')
    )
    process.exit(2)
  }
}

let failed = 0
for (const f of files) {
  const r = spawnSync(phpExe, ['-l', f], { encoding: 'utf8' })
  if (r.status !== 0) {
    failed++
    const msg = ((r.stdout || '') + (r.stderr || '')).trim()
    console.error(`\nFAIL: ${f}\n${msg || '(no output)'}`)
  }
}

if (failed > 0) {
  console.error(`\nPHP lint failed: ${failed} file(s).`)
  process.exit(1)
}

console.log(`PHP lint OK: ${files.length} file(s).`)

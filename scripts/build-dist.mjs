/**
 * 生产构建：先精简版（index），再完整版单文件（full），合并 manifest 供 vchat.php / AI.php
 * Production: slim build → full single-file build → merge dist/.vite/manifest.json
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const manifestPath = path.join(root, 'dist', '.vite', 'manifest.json')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: root, shell: true, env: process.env })
}

run('npx vite build --config vite.config.slim.mjs')
const slim = JSON.parse(readFileSync(manifestPath, 'utf8'))

run('npx vite build --config vite.config.full.mjs')
const fullOnly = JSON.parse(readFileSync(manifestPath, 'utf8'))

const merged = { ...slim, ...fullOnly }
writeFileSync(manifestPath, `${JSON.stringify(merged, null, 2)}\n`)
process.stdout.write('[build-dist] Merged manifest (index.html + full.html).\n')

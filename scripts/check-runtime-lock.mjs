import { createHash } from 'node:crypto'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'

function log(msg) {
  process.stdout.write(`[lock] ${msg}\n`)
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function sha256(filePath) {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function main() {
  const workspace = process.cwd()
  const lockFile = path.join(workspace, 'scripts', 'runtime-entry-lock.json')
  const lock = JSON.parse(await readFile(lockFile, 'utf8'))

  const aiPhpPath = path.join(workspace, lock.entryPhp)
  const aiPhpText = await readFile(aiPhpPath, 'utf8')

  log(`Checking runtime lock for ${lock.entryPhp}`)

  if (lock.mode === 'vite-full-only') {
    const substringLocations = lock.requiredPhpSubstringLocations
    if (Array.isArray(substringLocations) && substringLocations.length > 0) {
      for (const item of substringLocations) {
        const s = item?.substring
        const paths = item?.paths
        if (typeof s !== 'string' || !s) {
          throw new Error('Invalid lock item: missing substring')
        }
        if (!Array.isArray(paths) || paths.length === 0) {
          throw new Error(`Invalid lock item: missing paths for: ${s}`)
        }

        let found = false
        for (const rel of paths) {
          if (typeof rel !== 'string' || !rel) {
            throw new Error(`Invalid lock item path for substring: ${s}`)
          }
          const abs = path.join(workspace, rel)
          const text = await readFile(abs, 'utf8')
          if (text.includes(s)) {
            found = true
            break
          }
        }
        if (!found) {
          throw new Error(
            `Substring not found in any of the allowed files: ${s} (${paths.join(', ')})`
          )
        }
      }
    } else {
      for (const s of lock.requiredPhpSubstrings || []) {
        if (!aiPhpText.includes(s)) {
          throw new Error(`${lock.entryPhp} must contain: ${s}`)
        }
      }
    }
    if (/<script\s+src="adachat-/.test(aiPhpText)) {
      throw new Error(
        'AI.php must not load legacy adachat-*.js (Vite-only mode)'
      )
    }
    const viteModuleScriptPaths = lock.viteModuleScriptCheckPhpPaths || [
      lock.entryPhp,
      'backend/pages/ai_view.php',
      'backend/pages/partials/ai_footer_assets.php',
    ]
    const viteModuleScriptTexts = await Promise.all(
      viteModuleScriptPaths.map(async (rel) => {
        const abs = path.join(workspace, rel)
        return await readFile(abs, 'utf8')
      })
    )
    const viteModuleScriptHaystack = viteModuleScriptTexts.join('\n')
    if (!/<script\s+type="module"\s+src=/.test(viteModuleScriptHaystack)) {
      throw new Error(
        'Vite full entry must inject a <script type="module" src=...> (check ai_view / footer partials)'
      )
    }
  } else {
    throw new Error(`Unknown lock mode: ${lock.mode}`)
  }

  for (const dupRelPath of lock.forbiddenDuplicatePaths || []) {
    const dupPath = path.join(workspace, dupRelPath)
    const duplicateExists = await exists(dupPath)
    if (!duplicateExists) {
      continue
    }

    const baseName = path.basename(dupRelPath)
    const sourcePath = path.join(workspace, baseName)
    const sourceExists = await exists(sourcePath)
    if (!sourceExists) {
      throw new Error(
        `Duplicate exists but source-of-truth file is missing: ${baseName}`
      )
    }

    const [sourceHash, duplicateHash] = await Promise.all([
      sha256(sourcePath),
      sha256(dupPath),
    ])
    if (sourceHash !== duplicateHash) {
      throw new Error(
        `Duplicate runtime file drift detected: ${dupRelPath} differs from ${baseName}. ` +
          'Please update or remove duplicate file.'
      )
    }

    log(`Duplicate is byte-identical (allowed temporarily): ${dupRelPath}`)
  }

  log('Runtime entry lock check passed.')
}

main().catch((err) => {
  process.stderr.write(`[lock] FAILED: ${err.message}\n`)
  process.exitCode = 1
})

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'

const PHP_HOST = '127.0.0.1'
const PHP_PORT = 8920
const VITE_HOST = '127.0.0.1'
const VITE_PORT = 5173

function log(msg) {
  process.stdout.write(`[smoke] ${msg}\n`)
}

function makeUrl(host, port, path) {
  return `http://${host}:${port}${path}`
}

async function fetchText(url) {
  const res = await fetch(url)
  return {
    ok: res.ok,
    status: res.status,
    text: await res.text(),
  }
}

async function waitForHttp(url, attempts = 40, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status >= 400) {
        return true
      }
    } catch {
      // Service not ready yet.
    }
    await sleep(delayMs)
  }
  return false
}

function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function pickFreePort(host, preferredPorts) {
  for (const p of preferredPorts) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await canBind(host, p)
    if (ok) return p
  }
  throw new Error(`No free port in [${preferredPorts.join(', ')}]`)
}

function startProcess(command, args, label, useShell = false) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    shell: useShell,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.on('data', (buf) => process.stdout.write(`[${label}] ${buf}`))
  child.stderr.on('data', (buf) => process.stderr.write(`[${label}] ${buf}`))

  return child
}

async function killProcess(child) {
  if (!child || child.exitCode !== null) return

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn(
        'taskkill',
        ['/pid', String(child.pid), '/t', '/f'],
        {
          windowsHide: true,
          stdio: 'ignore',
        }
      )
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
    return
  }

  child.kill('SIGTERM')
  await sleep(300)
  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  let vitePort = VITE_PORT
  const phpCmd = process.platform === 'win32' ? 'php\\php.exe' : 'php/php.exe'

  let phpProc
  let viteProc

  try {
    const phpPortFree = await canBind(PHP_HOST, PHP_PORT)
    if (phpPortFree) {
      log('Starting PHP server...')
      phpProc = startProcess(
        phpCmd,
        ['-S', `${PHP_HOST}:${PHP_PORT}`, '-t', '.', 'router.php'],
        'php'
      )
    } else {
      log(`PHP port ${PHP_PORT} already in use, reusing existing server.`)
    }
    const phpReady = await waitForHttp(
      makeUrl(PHP_HOST, PHP_PORT, '/_api_test')
    )
    assert(phpReady, 'PHP server failed to become ready on 8920')

    vitePort = await pickFreePort(VITE_HOST, [5173, 5174, 5175, 5176, 5177])
    const npmCmd =
      process.platform === 'win32'
        ? `npm run dev -- --host ${VITE_HOST} --port ${vitePort}`
        : 'npm'

    log('Starting Vite server...')
    viteProc =
      process.platform === 'win32'
        ? startProcess(npmCmd, [], 'vite', true)
        : startProcess(
            npmCmd,
            [
              'run',
              'dev',
              '--',
              '--host',
              VITE_HOST,
              '--port',
              String(vitePort),
            ],
            'vite'
          )
    const viteReady = await waitForHttp(makeUrl(VITE_HOST, vitePort, '/'))
    assert(viteReady, `Vite server failed to become ready on ${vitePort}`)

    log('Checking pages and proxy...')
    const viteIndex = await fetchText(makeUrl(VITE_HOST, vitePort, '/'))
    const viteApi = await fetchText(makeUrl(VITE_HOST, vitePort, '/_api_test'))
    const phpApi = await fetchText(makeUrl(PHP_HOST, PHP_PORT, '/_api_test'))

    assert(viteIndex.status === 200, `Vite index status is ${viteIndex.status}`)
    assert(
      viteApi.status === 200,
      `Vite proxy _api_test status is ${viteApi.status}`
    )
    assert(phpApi.status === 200, `PHP _api_test status is ${phpApi.status}`)
    assert(
      viteApi.text.includes('"ok":true'),
      'Vite proxy _api_test body is unexpected'
    )
    assert(
      phpApi.text.includes('"ok":true'),
      'PHP _api_test body is unexpected'
    )

    log('All smoke checks passed.')
  } finally {
    log('Stopping servers...')
    await killProcess(viteProc)
    await killProcess(phpProc)
  }
}

main().catch((err) => {
  process.stderr.write(`[smoke] FAILED: ${err.message}\n`)
  process.exitCode = 1
})

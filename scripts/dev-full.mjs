import { spawn } from 'node:child_process'
import net from 'node:net'

const PHP_HOST = '127.0.0.1'
const PHP_PORT = 8920
const VITE_HOST = '127.0.0.1'
const VITE_PORT = 5173

function log(msg) {
  process.stdout.write(`[dev-full] ${msg}\n`)
}

function start(command, args, label, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })

  child.stdout.on('data', (buf) => process.stdout.write(`[${label}] ${buf}`))
  child.stderr.on('data', (buf) => process.stderr.write(`[${label}] ${buf}`))

  child.on('exit', (code, signal) => {
    const suffix = signal ? `signal=${signal}` : `code=${code}`
    log(`${label} exited (${suffix})`)
  })

  return child
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

async function killTree(child) {
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
}

async function main() {
  const phpCmd = process.platform === 'win32' ? 'php\\php.exe' : 'php/php.exe'
  let vitePort = VITE_PORT

  let php = null
  const phpPortFree = await canBind(PHP_HOST, PHP_PORT)
  if (phpPortFree) {
    php = start(
      phpCmd,
      ['-S', `${PHP_HOST}:${PHP_PORT}`, '-t', '.', 'router.php'],
      'php'
    )
  } else {
    log(`PHP port ${PHP_PORT} already in use, reusing existing server.`)
  }

  vitePort = await pickFreePort(VITE_HOST, [5173, 5174, 5175, 5176, 5177])
  const npmCmd =
    process.platform === 'win32'
      ? `npm run dev -- --host ${VITE_HOST} --port ${vitePort}`
      : 'npm'
  const vite =
    process.platform === 'win32'
      ? start(npmCmd, [], 'vite', { shell: true })
      : start(
          npmCmd,
          ['run', 'dev', '--', '--host', VITE_HOST, '--port', String(vitePort)],
          'vite'
        )

  log(`PHP:  http://${PHP_HOST}:${PHP_PORT}/login.php`)
  log(`Vite: http://${VITE_HOST}:${vitePort}/`)
  log('Press Ctrl+C to stop both servers.')

  const shutdown = async () => {
    log('Shutting down both servers...')
    await Promise.all([killTree(vite), killTree(php)])
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  process.stderr.write(`[dev-full] FAILED: ${err.message}\n`)
  process.exitCode = 1
})

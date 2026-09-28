// Compiles the bundled Swift helpers into resources/bin (macOS only).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform !== 'darwin') {
  console.log('Skipping native helper build (macOS only).')
  process.exit(0)
}

const targets = [
  // Apple Vision speaker tracker.
  { source: 'Tracker.swift', output: 'sunday-tracker', label: 'speaker tracker' },
  // Local Network consent probe (Network.framework triggers the macOS
  // Local Network prompt that raw sockets never show).
  { source: 'LanProbe.swift', output: 'sunday-lanprobe', label: 'LAN probe' }
]

mkdirSync(join(root, 'resources', 'bin'), { recursive: true })
let fresh = true
for (const t of targets) {
  const source = join(root, 'resources', 'swift', t.source)
  const output = join(root, 'resources', 'bin', t.output)
  if (existsSync(output) && statSync(output).mtimeMs >= statSync(source).mtimeMs) continue
  fresh = false
  try {
    execFileSync('swiftc', ['-O', '-swift-version', '5', source, '-o', output], { stdio: 'inherit' })
    console.log(`Built ${t.label}.`)
  } catch {
    console.warn(`Could not build the ${t.label} (is Xcode Command Line Tools installed?).`)
  }
}
if (fresh) process.exit(0)

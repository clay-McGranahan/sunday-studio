// Signs the packaged app with your Apple Development identity so macOS Tahoe
// grants Local Network access (unsigned `electron-vite dev` builds are silently
// blocked with no popup and no Settings entry).
// Usage: npm run dist:unsigned && npm run sign
//    or: IDENTITY="Apple Development: ..." npm run sign
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const src = join(root, 'dist/mac-arm64/Sunday Studio.app')
const tmp = '/tmp/SundayStudio-sign.app'
const dest = join(homedir(), 'Applications/Sunday Studio.app')

const identity =
  process.env.IDENTITY ??
  execSync('security find-identity -v -p codesigning', { encoding: 'utf8' })
    .split('\n')
    .find((l) => l.includes('Apple Development'))
    ?.split('"')[1]

if (!identity) {
  console.error('No Apple Development identity found. Plug in Xcode or set IDENTITY env.')
  process.exit(1)
}
if (!existsSync(src)) {
  console.error(`Missing ${src}. Run: CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --publish never -c.mac.identity=null`)
  process.exit(1)
}
console.log(`Signing with "${identity}"…`)
rmSync(tmp, { recursive: true, force: true })
execFileSync('ditto', ['--norsrc', src, tmp], { stdio: 'inherit' })
// Tahoe's com.apple.provenance / FinderInfo / fpfs xattrs break codesign;
// `xattr -cr` skips provenance, so delete explicitly (re-added on dirs is fine).
for (const attr of ['com.apple.provenance', 'com.apple.FinderInfo', 'com.apple.fileprovider.fpfs#P']) {
  try {
    execSync(`find "${tmp}" -exec xattr -d ${attr} {} \\; 2>/dev/null`, { stdio: 'ignore' })
  } catch {}
}
execFileSync(
  'codesign',
  [
    '--sign', identity,
    '--force', '--timestamp', '--deep', '--options', 'runtime',
    '--entitlements', join(root, 'node_modules/app-builder-lib/templates/entitlements.mac.plist'),
    tmp
  ],
  { stdio: 'inherit' }
)
execFileSync('codesign', ['--verify', '--deep', '--strict', tmp], { stdio: 'inherit' })
rmSync(dest, { recursive: true, force: true })
execFileSync('cp', ['-R', tmp, dest])
console.log(`Signed → ${dest}\nOpen it from Finder (right-click → Open on first launch), allow Local Network when prompted.`)

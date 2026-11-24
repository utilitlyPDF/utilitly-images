// Real-install check: packs every package exactly as npm would publish it,
// installs the tarballs into a brand-new project in a temp folder, and runs
// each one there through both `import` and `require`.
//
//   npm run build && node scripts/smoke-install.mjs
//
// Catches what tests inside the repo can't: a file missing from the tarball, a
// dependency that isn't declared, an exports map that doesn't resolve, a
// .wasm file the Node entry can't find once installed.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Folders with a package.json only: macOS drops .DS_Store files in here.
const packages = readdirSync(join(root, 'packages')).filter(name => existsSync(join(root, 'packages', name, 'package.json')))
const work = mkdtempSync(join(tmpdir(), 'utilitly-images-smoke-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** A width × height RGBA PNG with a gradient, written without any of the packages. */
function samplePng(width, height) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 4
      raw[i] = Math.round((x / Math.max(1, width - 1)) * 255)
      raw[i + 1] = Math.round((y / Math.max(1, height - 1)) * 255)
      raw[i + 2] = 160
      raw[i + 3] = 255
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Both helpers are copied into the exercise script as source, so they use
// nothing from this file's scope.
function magicOf(bytes) {
  const b = bytes
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}

function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return `${view.getUint32(16)}x${view.getUint32(20)}`
}

// One entry per package: the name the exercise script loads it as, and an
// expression that is true when the installed package works.
const EXERCISES = {
  'image-crop': {
    as: 'imageCrop',
    check: "pngSize(await imageCrop.cropImage(png, { x: 0, y: 0, width: 4, height: 4 })) === '4x4'"
      + " && magicOf(await imageCrop.cropImage(png, { aspect: '1:1' }, { format: 'jpeg' })) === 'jpeg'",
  },
}

const SAMPLE = samplePng(8, 8).toString('base64')

// One script, run twice: once as ESM, once as CommonJS.
const exercise = load => `
${load}
const png = Buffer.from('${SAMPLE}', 'base64')
const magicOf = ${magicOf.toString()}
const pngSize = ${pngSize.toString()}
const results = {}
${Object.entries(EXERCISES).map(([name, { check }]) => `results['${name}'] = ${check}`).join('\n')}
console.log(JSON.stringify(results))
`

const ESM = exercise(Object.entries(EXERCISES).map(([name, { as }]) => `import * as ${as} from '@utilitly/${name}'`).join('\n'))
const CJS = `(async () => {${exercise(Object.entries(EXERCISES).map(([name, { as }]) => `const ${as} = require('@utilitly/${name}')`).join('\n'))}})().catch(err => { console.error(err); process.exitCode = 1 })`

let failed = false

// The temp project installs only the tarballs, but the repo's own
// node_modules could hide a package that imports something it doesn't
// declare. So check the built code directly: everything it imports must be
// one of the package's declared dependencies.
const IMPORTS = /\bimport\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|\brequire\(\s*["']([^"']+)["']\s*\)/g
for (const name of packages) {
  const dir = join(root, 'packages', name)
  const declared = Object.keys(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies ?? {})
  for (const file of readdirSync(join(dir, 'dist')).filter(f => /\.(mjs|cjs)$/.test(f))) {
    const used = [...readFileSync(join(dir, 'dist', file), 'utf8').matchAll(IMPORTS)]
      .map(m => m[1] ?? m[2] ?? m[3])
      // Node's built-ins aren't dependencies, with or without the node: prefix
      // (tsdown's CommonJS shim for import.meta.url requires plain "url").
      .filter(spec => !spec.startsWith('.') && !spec.startsWith('node:') && !builtinModules.includes(spec))
      .map(spec => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'))
    for (const dep of new Set(used)) {
      if (!declared.includes(dep)) {
        failed = true
        console.error(`FAIL  @utilitly/${name} dist/${file} imports "${dep}", which is not in its dependencies`)
      }
    }
  }
}

// What a README example reads, by extension. JPEG and WebP samples are made
// from the PNG sample with the repo's own built image-crop, cropping nothing
// and writing the other format.
async function sampleFile(name) {
  const ext = extname(name).toLowerCase()
  const png = samplePng(640, 480)
  if (ext === '.png') return png
  const format = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' }[ext]
  if (!format) throw new Error(`no sample for ${name}`)
  const { cropImage } = await import('@utilitly/image-crop')
  return cropImage(png, { x: 0, y: 0, width: 640, height: 480 }, { format })
}

const EXPECTED_MAGIC = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' }

try {
  const tarballs = join(work, 'tarballs')
  mkdirSync(tarballs)
  for (const name of packages) {
    const out = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', tarballs], join(root, 'packages', name)))[0]
    console.log(`packed ${out.name}: ${out.files.map(f => f.path).join(', ')}`)
  }

  const app = join(work, 'app')
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'smoke-app', private: true }))
  if (packages.length > 0) {
    run(npm, ['install', '--no-audit', '--no-fund', '--prefer-offline', ...readdirSync(tarballs).map(t => join(tarballs, t))], app)
  }
  writeFileSync(join(app, 'esm.mjs'), ESM)
  writeFileSync(join(app, 'cjs.cjs'), CJS)

  for (const [label, file] of [['import', 'esm.mjs'], ['require', 'cjs.cjs']]) {
    const results = JSON.parse(run(process.execPath, [file], app))
    for (const name of packages) {
      const ok = results[name] === true
      failed ||= !ok
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(7)} @utilitly/${name}`)
    }
  }

  // Each README's Node.js example, run exactly as written against the files it
  // reads, which are generated here. Every image it writes must be the format
  // its extension says.
  for (const name of packages) {
    const markdown = readFileSync(join(root, 'packages', name, 'README.md'), 'utf8')
    const example = [...markdown.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]).find(code => code.includes("from 'node:fs/promises'"))
    let ok = false
    let detail = 'no Node.js example in the README'
    if (example) {
      const dir = join(app, `readme-${name}`)
      mkdirSync(dir)
      for (const [, file] of example.matchAll(/readFile\('([^']+)'\)/g)) writeFileSync(join(dir, file), await sampleFile(file))
      writeFileSync(join(dir, 'example.mjs'), example)
      const before = new Set(readdirSync(dir))
      try {
        run(process.execPath, ['example.mjs'], dir)
        const written = readdirSync(dir).filter(f => !before.has(f) && EXPECTED_MAGIC[extname(f).toLowerCase()])
        ok = written.length > 0 && written.every(f => magicOf(readFileSync(join(dir, f))) === EXPECTED_MAGIC[extname(f).toLowerCase()])
        detail = written.join(', ') || 'wrote no image'
      } catch (err) {
        const lines = String(err.stderr || err.message).trim().split('\n')
        detail = lines.find(line => /^\w*Error: /.test(line)) ?? lines[0]
      }
    }
    failed ||= !ok
    console.log(`${ok ? 'PASS' : 'FAIL'}  README  @utilitly/${name}: ${detail}`)
  }
} catch (err) {
  failed = true
  console.error(err.stderr || err)
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failed) {
  console.error('\nSmoke install failed.')
  process.exitCode = 1
} else {
  console.log(`\nSmoke install passed: ${packages.length} packages, installed from their tarballs, via import and require, and every README example ran.`)
}

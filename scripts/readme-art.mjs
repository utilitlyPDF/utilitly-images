// Generates the animated SVGs the READMEs show, in a light and a dark version.
//
//   node scripts/readme-art.mjs
//
// GitHub loads README images through <img>, which strips scripts, so every
// animation here is CSS only. Text uses system fonts because an <img> SVG can't
// load web fonts. Each animated element's resting style is the frame worth
// showing on its own, so reduced motion (and any viewer that doesn't animate)
// still gets a meaningful picture.
//
// scripts/readme.test.mjs fails if the files on disk drift from this script.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const THEMES = {
  light: {
    card: '#f6f7fb', panel: '#ffffff', stroke: '#dcdcea', ink: '#1c1c30', muted: '#6b6b86', faint: '#a6a7bf',
    accent: '#4f46e5', accentSoft: '#e6e5fc', page: '#ffffff', pageLine: '#e4e4ef',
    green: '#1a9b4b', amber: '#d97706', red: '#e5484d',
  },
  dark: {
    card: '#11121b', panel: '#181926', stroke: '#2c2d40', ink: '#e8e8f3', muted: '#9a9bb6', faint: '#5d5e7a',
    accent: '#9a9bfb', accentSoft: '#26274a', page: '#1d1e2c', pageLine: '#33344a',
    green: '#3fb950', amber: '#f0a032', red: '#ff6b6f',
  },
}

const FONT = `ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function svg({ width, height, title, desc, css, body }, t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(desc)}</desc>
<style>
text { font-family: ${FONT}; fill: ${t.ink}; }
.mono { font-family: ${MONO}; }
.muted { fill: ${t.muted}; }
.faint { fill: ${t.faint}; }
.accent { fill: ${t.accent}; }
.anim { transform-box: fill-box; transform-origin: center; }
${css.trim()}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="16" fill="${t.card}" stroke="${t.stroke}"/>
${body.trim()}
</svg>
`
}

/**
 * A photo: sky, two mountains and a sun. The mountains stop a few pixels in
 * from the bottom corners so they stay inside the rounded frame (a clipPath
 * would need url(), which GitHub's image proxy refuses).
 */
function photo(t, { x, y, w, h, r = 6 }) {
  const px = (fx, fy) => `${Math.round(x + w * fx)} ${Math.round(y + h * fy)}`
  const sun = Math.max(4, Math.round(Math.min(w, h) * 0.08))
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${t.accentSoft}" stroke="${t.stroke}"/>` +
    `<path d="M ${x + 3} ${y + h - 1} L ${px(0.3, 0.45)} L ${px(0.5, 0.7)} L ${px(0.66, 0.52)} L ${x + w - 3} ${y + h - 1} Z" fill="${t.accent}" opacity="0.55"/>` +
    `<circle cx="${Math.round(x + w * 0.78)}" cy="${Math.round(y + h * 0.25)}" r="${sun}" fill="${t.amber}" opacity="0.8"/>`
}

/** The code line along the bottom of each hero. */
function caption(code, note) {
  return `<text x="36" y="238" font-size="14" class="mono">${esc(code)}</text>` +
    (note ? `<text x="804" y="238" font-size="12.5" text-anchor="end" class="muted">${esc(note)}</text>` : '')
}

// ── Heroes: one per package ─────────────────────────────────────────────────

/** Three readouts that take turns, 3 s each. The resting frame (no animation) is the last. */
const TURNS_CSS = `
.t0, .t1 { opacity: 0; }
.t0 { animation: t0 9s steps(1, end) infinite; }
.t1 { animation: t1 9s steps(1, end) infinite; }
.t2 { animation: t2 9s steps(1, end) infinite; }
@keyframes t0 { 0% { opacity: 1; } 33.333% { opacity: 0; } }
@keyframes t1 { 0% { opacity: 0; } 33.333% { opacity: 1; } 66.666% { opacity: 0; } }
@keyframes t2 { 0% { opacity: 0; } 66.666% { opacity: 1; } }`

function cropHero(t) {
  const P = { x: 150, y: 30, w: 300, h: 180 }
  const frames = [
    { cls: 't0', name: '1:1', note: 'square, for profile pictures', w: 180, h: 180 },
    { cls: 't1', name: '4:3', note: 'the classic photo shape', w: 240, h: 180 },
    { cls: 't2', name: '16:9', note: 'widescreen, for thumbnails', w: 300, h: 169 },
  ]
  const frame = f => {
    const fx = P.x + (P.w - f.w) / 2
    const fy = P.y + Math.floor((P.h - f.h) / 2)
    // The dimmed surround is the photo's rectangle minus the frame's, filled even-odd
    // (a mask would need url(), which GitHub's image proxy strips).
    const surround = `M ${P.x} ${P.y} h ${P.w} v ${P.h} h ${-P.w} Z M ${fx} ${fy} h ${f.w} v ${f.h} h ${-f.w} Z`
    const corner = (cx, cy, dx, dy) => `M ${cx + dx * 14} ${cy} H ${cx} V ${cy + dy * 14}`
    return `<g class="${f.cls}"><path d="${surround}" fill="${t.card}" fill-rule="evenodd" opacity="0.72"/>
<rect x="${fx}" y="${fy}" width="${f.w}" height="${f.h}" fill="none" stroke="${t.accent}" stroke-width="2"/>
<path d="${corner(fx, fy, 1, 1)} ${corner(fx + f.w, fy, -1, 1)} ${corner(fx, fy + f.h, 1, -1)} ${corner(fx + f.w, fy + f.h, -1, -1)}" fill="none" stroke="${t.accent}" stroke-width="4" stroke-linecap="square"/>
<text x="500" y="126" font-size="34" font-weight="700" class="mono accent">${f.name}</text><text x="500" y="154" font-size="13" class="muted">${f.note}</text></g>`
  }
  return svg({
    width: 840, height: 260,
    title: '@utilitly/image-crop',
    desc: 'A crop frame snaps to 1:1, then 4:3, then 16:9 over a photo, dimming everything outside it.',
    css: TURNS_CSS,
    body: `${photo(t, { ...P, r: 0 })}
${frames.map(frame).join('\n')}
<text x="500" y="84" font-size="13" class="muted">Crop to</text>
${caption("await cropImage(photo, { aspect: '16:9' })", 'or an exact x, y, width and height')}`,
  }, t)
}

// ── The Network panel every README carries ──────────────────────────────────

// The codec files each job loads, with their size in kB. They're the only
// requests: fetched once from the app's own site, then cached. The image is
// in none of them.
const CODEC_KB = { 'mozjpeg_dec.wasm': 166, 'mozjpeg_enc.wasm': 251 }

const NETWORK_TASKS = {
  root: { file: 'photo.jpg', doing: 'processing photo.jpg', codecs: ['mozjpeg_dec.wasm', 'mozjpeg_enc.wasm'] },
  'image-crop': { file: 'photo.jpg', doing: 'cropping to 16:9', codecs: ['mozjpeg_dec.wasm', 'mozjpeg_enc.wasm'] },
}

function networkPanel(t, name) {
  const task = NETWORK_TASKS[name]
  const D = { x: 304, y: 24, w: 512, h: 184 }
  const col = { name: D.x + 14, status: D.x + 250, type: D.x + 320, size: D.x + 400 }
  const tabs = [['Elements', 0], ['Console', 74], ['Sources', 142], ['Network', 210]]
  const rows = task.codecs.map((file, i) => {
    const y = D.y + 94 + i * 16
    return `<text x="${col.name}" y="${y}" font-size="11.5" class="mono">${esc(file)}</text>` +
      `<text x="${col.status}" y="${y}" font-size="11.5" class="mono muted">200</text>` +
      `<text x="${col.type}" y="${y}" font-size="11.5" class="mono muted">wasm</text>` +
      `<text x="${col.size}" y="${y}" font-size="11.5" class="mono muted">${CODEC_KB[file]} kB</text>`
  }).join('\n')
  const body = `${rows}
<text x="${D.x + D.w / 2}" y="${D.y + 94 + task.codecs.length * 16 + 6}" text-anchor="middle" font-size="12" class="faint">the codecs, from your own site · the image itself never leaves the tab</text>`
  const n = task.codecs.length
  const footer = `<text x="${D.x + 14}" y="${D.y + D.h - 9}" font-size="11.5" class="mono muted"><tspan class="accent" font-weight="700">${n} requests</tspan>  |  codecs only  |  0 B of the image sent</text>`
  return svg({
    width: 840, height: 232,
    title: `${name === 'root' ? '@utilitly image packages' : `@utilitly/${name}`}: the image never leaves the tab`,
    desc: `While the app is ${task.doing}, the browser's Network panel shows only ${n} codec files loading from the app's own site. The image itself is never sent.`,
    css: `
.fill { transform-box: fill-box; transform-origin: left center; animation: fill 5s ease-in-out infinite; }
.done { animation: done 5s ease-in-out infinite; }
.rec { animation: rec 1.2s ease-in-out infinite; }
@keyframes fill { 0%, 8% { transform: scaleX(0); } 78%, 96% { transform: scaleX(1); } 100% { transform: scaleX(0); } }
@keyframes done { 0%, 78% { opacity: 0; } 84%, 96% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rec { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`,
    body: `<rect x="24" y="24" width="264" height="184" rx="10" fill="${t.panel}" stroke="${t.stroke}"/>
<text x="42" y="50" font-size="12" class="muted">your app</text>
<rect x="42" y="64" width="228" height="34" rx="7" fill="${t.card}" stroke="${t.stroke}"/>
<rect x="52" y="73" width="26" height="16" rx="3" fill="${t.accent}"/><text x="65" y="85" text-anchor="middle" font-size="9" font-weight="700" style="fill:#ffffff">IMG</text>
<text x="86" y="85" font-size="12" class="mono">${esc(task.file)}</text>
<text x="42" y="126" font-size="14">${esc(task.doing)}</text>
<rect x="42" y="140" width="228" height="8" rx="4" fill="${t.pageLine}"/>
<rect x="42" y="140" width="228" height="8" rx="4" fill="${t.accent}" class="fill"/>
<text x="42" y="180" font-size="13" font-weight="600" class="done" style="fill:${t.green}">✓ done, in this tab</text>
<rect x="${D.x}" y="${D.y}" width="${D.w}" height="${D.h}" rx="10" fill="${t.panel}" stroke="${t.stroke}"/>
${tabs.map(([label, dx]) => `<text x="${D.x + 14 + dx}" y="${D.y + 20}" font-size="12" class="${label === 'Network' ? '' : 'muted'}"${label === 'Network' ? ' font-weight="600"' : ''}>${label}</text>`).join('')}
<rect x="${D.x + 224}" y="${D.y + 27}" width="52" height="2" fill="${t.accent}"/>
<line x1="${D.x}" y1="${D.y + 29.5}" x2="${D.x + D.w}" y2="${D.y + 29.5}" stroke="${t.stroke}"/>
<circle cx="${D.x + 20}" cy="${D.y + 43}" r="5" fill="${t.red}" class="rec"/>
<circle cx="${D.x + 40}" cy="${D.y + 43}" r="5" fill="none" stroke="${t.faint}" stroke-width="1.5"/><line x1="${D.x + 36.5}" y1="${D.y + 46.5}" x2="${D.x + 43.5}" y2="${D.y + 39.5}" stroke="${t.faint}" stroke-width="1.5"/>
<rect x="${D.x + 58}" y="${D.y + 37}" width="11" height="11" rx="2" fill="none" stroke="${t.faint}"/><text x="${D.x + 74}" y="${D.y + 47}" font-size="11.5" class="muted">Preserve log</text>
<rect x="${D.x + 170}" y="${D.y + 35}" width="150" height="16" rx="4" fill="${t.card}" stroke="${t.stroke}"/><text x="${D.x + 178}" y="${D.y + 47}" font-size="11" class="faint">Filter</text>
<line x1="${D.x}" y1="${D.y + 57.5}" x2="${D.x + D.w}" y2="${D.y + 57.5}" stroke="${t.stroke}"/>
<text x="${col.name}" y="${D.y + 73}" font-size="11.5" font-weight="600" class="muted">Name</text>
<text x="${col.status}" y="${D.y + 73}" font-size="11.5" font-weight="600" class="muted">Status</text>
<text x="${col.type}" y="${D.y + 73}" font-size="11.5" font-weight="600" class="muted">Type</text>
<text x="${col.size}" y="${D.y + 73}" font-size="11.5" font-weight="600" class="muted">Size</text>
<line x1="${D.x}" y1="${D.y + 79.5}" x2="${D.x + D.w}" y2="${D.y + 79.5}" stroke="${t.stroke}"/>
${body}
<line x1="${D.x}" y1="${D.y + D.h - 26.5}" x2="${D.x + D.w}" y2="${D.y + D.h - 26.5}" stroke="${t.stroke}"/>
${footer}`,
  }, t)
}

// ── Output ──────────────────────────────────────────────────────────────────

const HEROES = {
  'image-crop': cropHero,
}

/** Every generated file, as { 'repo/relative/path.svg': contents }. */
export function renderAll() {
  const files = {}
  for (const [theme, t] of Object.entries(THEMES)) {
    files[`assets/network-${theme}.svg`] = networkPanel(t, 'root')
    for (const [name, hero] of Object.entries(HEROES)) {
      files[`packages/${name}/assets/hero-${theme}.svg`] = hero(t)
      files[`packages/${name}/assets/network-${theme}.svg`] = networkPanel(t, name)
    }
  }
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = renderAll()
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true })
    writeFileSync(join(ROOT, path), contents)
  }
  console.log(`Wrote ${Object.keys(files).length} SVGs.`)
}

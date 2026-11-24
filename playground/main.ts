// Drives each package from a form. Imports resolve to the BUILT packages
// (packages/*/dist), so this exercises exactly what npm would ship.

import { cropImage, type ImageFormat } from '@utilitly/image-crop'

const $ = <T extends Element>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T
const status = $<HTMLParagraphElement>('.status')
const results = $<HTMLDivElement>('.results')
const objectUrls: string[] = []

// ── Tabs ────────────────────────────────────────────────────────────────────
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t === tab))
    for (const form of document.querySelectorAll<HTMLFormElement>('form.tool')) form.hidden = form.dataset.tool !== tab.dataset.tab
    // A result or error belongs to the tool that made it.
    for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url)
    results.replaceChildren()
    status.classList.remove('error')
    status.textContent = 'Choose an image and run it.'
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer())
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
const baseName = (file: File) => file.name.replace(/\.[^.]+$/, '')

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const
const EXTENSION = { jpeg: 'jpg', png: 'png', webp: 'webp' } as const
type Format = keyof typeof MIME

/** The format the bytes are in, read from their first bytes, so the preview and download name are right. */
function formatOf(bytes: Uint8Array): Format {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  return 'webp'
}

const outputName = (file: File, suffix: string, bytes: Uint8Array) => `${baseName(file)}-${suffix}.${EXTENSION[formatOf(bytes)]}`

function show(outputs: { name: string; bytes: Uint8Array<ArrayBuffer> }[], note = '') {
  for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url)
  results.replaceChildren()
  for (const { name, bytes } of outputs) {
    const url = URL.createObjectURL(new Blob([bytes], { type: MIME[formatOf(bytes)] }))
    objectUrls.push(url)
    const item = document.createElement('div')
    item.className = 'result'
    const link = Object.assign(document.createElement('a'), { href: url, download: name, textContent: `Download ${name}` })
    const size = Object.assign(document.createElement('span'), { textContent: ` · ${kb(bytes.length)}` })
    const line = document.createElement('div')
    line.append(link, size)
    const preview = Object.assign(document.createElement('img'), { src: url, alt: `Preview of ${name}` })
    preview.addEventListener('load', () => { size.textContent += ` · ${preview.naturalWidth} × ${preview.naturalHeight}` }, { once: true })
    item.append(line, preview)
    results.append(item)
  }
  status.classList.remove('error')
  status.textContent = `Done${note ? ` · ${note}` : ''}. Made in your browser; nothing was uploaded.`
}

function showError(err: unknown) {
  results.replaceChildren()
  status.classList.add('error')
  const e = err as { code?: string; message?: string }
  status.textContent = e?.code ? `${e.code}: ${e.message}` : `Unexpected error: ${String(e?.message ?? err)}`
  console.error(err)
}

const numberOr = (value: FormDataEntryValue | null, fallback: number) => (value === null || value === '' ? fallback : Number(value))
const textOrUndefined = (value: FormDataEntryValue | null) => (typeof value === 'string' && value.trim() !== '' ? value : undefined)

// ── Tools ───────────────────────────────────────────────────────────────────
type Output = { outputs: { name: string; bytes: Uint8Array<ArrayBuffer> }[]; note?: string }

const tools: Record<string, (data: FormData) => Promise<Output>> = {
  async crop(data) {
    const file = data.get('file') as File
    const area = data.get('mode') === 'aspect'
      ? { aspect: data.get('aspect') as '1:1' | '4:3' | '16:9' }
      : { x: numberOr(data.get('x'), 0), y: numberOr(data.get('y'), 0), width: numberOr(data.get('width'), 1), height: numberOr(data.get('height'), 1) }
    const bytes = await cropImage(await bytesOf(file), area, {
      format: (textOrUndefined(data.get('format')) as ImageFormat | undefined),
      quality: numberOr(data.get('quality'), 90),
    })
    return { outputs: [{ name: outputName(file, 'cropped', bytes), bytes }] }
  },
}

for (const form of document.querySelectorAll<HTMLFormElement>('form.tool')) {
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const button = $<HTMLButtonElement>('button[type="submit"]', form)
    button.disabled = true
    status.classList.remove('error')
    status.textContent = 'Working…'
    try {
      const { outputs, note } = await tools[form.dataset.tool as string](new FormData(form))
      if (outputs.length > 0) show(outputs, note)
    } catch (err) {
      showError(err)
    } finally {
      button.disabled = false
    }
  })
}

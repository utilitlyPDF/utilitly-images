import { ImageError } from './errors'
import { parseFormat, type FormatOption, type ImageFormat } from './format'
import type { Rgb } from './pixels'

/** The output options every package takes. */
export type EncodeOptions = {
  /** Output format. Each package documents its default. */
  format?: FormatOption
  /** 40-100, for JPEG and WebP. PNG is lossless, so it ignores this. */
  quality?: number
  /** Hex color that JPEG puts under transparency. */
  background?: string
}

/** The options checked and filled in. */
export type Encoding = { format: ImageFormat; quality: number; background: Rgb }

export const DEFAULT_QUALITY = 90
export const DEFAULT_BACKGROUND = '#ffffff'

/**
 * A typed or pasted hex code as #rrggbb, or null when it isn't one.
 * Takes 3 or 6 digits, with or without the #, any case, surrounding spaces ignored.
 */
export function parseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!m) return null
  const d = m[1].toLowerCase()
  return '#' + (d.length === 3 ? d.replace(/./g, c => c + c) : d)
}

function parseBackground(value: unknown): Rgb {
  const hex = typeof value === 'string' ? parseHex(value) : null
  if (!hex) {
    throw new ImageError('INVALID_OPTIONS', `background must be a hex color such as '#ffffff', not ${JSON.stringify(value) ?? String(value)}.`)
  }
  const n = parseInt(hex.slice(1), 16)
  return { r: n >> 16, g: (n >> 8) & 0xff, b: n & 0xff }
}

/**
 * The quality range the free Convert Image tool on utilitly.com offers. Lower
 * settings are Compress Image's job (a Basic tool), so they aren't offered here.
 */
export const MIN_QUALITY = 40

function parseQuality(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_QUALITY || value > 100) {
    throw new ImageError('INVALID_OPTIONS', `quality must be a number from ${MIN_QUALITY} to 100, not ${JSON.stringify(value) ?? String(value)}.`)
  }
  return value
}

/** Checks the output options and fills in the defaults, using `fallback` when no format is given. */
export function resolveEncoding(options: EncodeOptions | undefined, fallback: ImageFormat): Encoding {
  const o = options ?? {}
  return {
    format: o.format === undefined ? fallback : parseFormat(o.format),
    quality: o.quality === undefined ? DEFAULT_QUALITY : parseQuality(o.quality),
    background: parseBackground(o.background ?? DEFAULT_BACKGROUND),
  }
}

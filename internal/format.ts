import { ImageError } from './errors'

export type ImageFormat = 'jpeg' | 'png' | 'webp'
/** What callers may pass: 'jpg' is another name for JPEG. */
export type FormatOption = ImageFormat | 'jpg'

export const FORMAT_LABEL: Record<ImageFormat, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP' }

/**
 * The longest side each format can store. WebP's header holds 14 bits per
 * side; MozJPEG refuses past 65,500; PNG's limit is far beyond MAX_PIXELS.
 */
export const MAX_SIDE: Record<ImageFormat, number> = { jpeg: 65_500, png: 2_147_483_647, webp: 16_383 }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length && prefix.every((b, i) => bytes[at + i] === b)
const ascii = (text: string) => [...text].map(c => c.charCodeAt(0))
const textAt = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))

/** Which of the three formats the bytes are, from their first bytes only. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp'
  return null
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

/** A name for bytes that aren't one of the three formats, when they are something recognisable. */
export function otherFormatName(bytes: Uint8Array): string | null {
  if (startsWith(bytes, ascii('GIF8'))) return 'GIF'
  if (startsWith(bytes, ascii('BM'))) return 'BMP'
  if (startsWith(bytes, ascii('II*\0')) || startsWith(bytes, ascii('MM\0*'))) return 'TIFF'
  if (startsWith(bytes, ascii('%PDF'))) return 'PDF'
  if (startsWith(bytes, [0xff, 0x0a]) || startsWith(bytes, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20])) return 'JPEG XL'
  if (startsWith(bytes, ascii('ftyp'), 4)) {
    const brand = textAt(bytes, 8, 12)
    if (AVIF_BRANDS.has(brand)) return 'AVIF'
    if (HEIC_BRANDS.has(brand)) return 'HEIC'
  }
  // SVG markup is ASCII, so the bytes are read as characters directly, past a UTF-8 byte-order mark.
  const from = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0
  const head = textAt(bytes, from, from + 1024).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'SVG'
  return null
}

/** The error for bytes that aren't JPEG, PNG or WebP, naming what they are when that's known. */
export function unsupportedFormatError(bytes: Uint8Array, what: string): ImageError {
  const name = otherFormatName(bytes)
  return new ImageError(
    'UNSUPPORTED_FORMAT',
    name
      ? `${what} is a ${name} file. Convert it to JPEG, PNG or WebP first.`
      : `${what} isn't a JPEG, PNG or WebP image.`,
  )
}

/** A format option as one of the three formats; 'jpg' becomes 'jpeg'. */
export function parseFormat(value: unknown, option = 'format'): ImageFormat {
  if (value === 'jpg' || value === 'jpeg') return 'jpeg'
  if (value === 'png' || value === 'webp') return value
  throw new ImageError('INVALID_OPTIONS', `${option} must be 'jpeg', 'png' or 'webp', not ${JSON.stringify(value) ?? String(value)}.`)
}

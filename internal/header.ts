import { ImageError } from './errors'
import { orientationFromTiff, type Orientation } from './exif'
import { FORMAT_LABEL, detectFormat, unsupportedFormatError, type ImageFormat } from './format'

/** What a file's header says, before any pixels are decoded. Width and height are upright. */
export type ImageHeader = { format: ImageFormat; width: number; height: number; orientation: Orientation }

type Stored = { width: number; height: number; orientation: Orientation }

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0

/** Start-of-frame markers, which hold the size. C4, C8 and CC are other things. */
const isFrame = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

/** Lossless JPEG frames, which MozJPEG doesn't decode. */
const isLossless = (m: number) => m === 0xc3 || m === 0xc7 || m === 0xcb || m === 0xcf

/**
 * Refuses JPEG kinds MozJPEG can't decode: CMYK (4 channels, common from print
 * work), 12-bit and lossless. Its failure on them is fatal and would be
 * reported as a damaged file, so they're named here instead.
 */
function checkJpegKind(marker: number, precision: number, channels: number, what: string): void {
  const kind = isLossless(marker) ? 'a lossless JPEG'
    : precision !== 8 ? `a ${precision}-bit JPEG`
    : channels === 4 ? 'a CMYK JPEG'
    : channels !== 1 && channels !== 3 ? `a JPEG with ${channels} color channels`
    : null
  if (kind) {
    throw new ImageError('UNSUPPORTED_FORMAT', `${what} is ${kind}, which these packages can't read. Save it as an ordinary RGB JPEG first.`)
  }
}

function jpegHeader(b: Uint8Array, what: string): Stored | null {
  let orientation: Orientation = 1
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) { i++; continue } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue } // no length
    if (marker === 0xda || marker === 0xd9) return null // image data or the end, and still no size
    const length = u16be(b, i + 2)
    const payload = i + 4
    const end = i + 2 + length
    if (length < 2 || end > b.length) return null
    if (marker === 0xe1 && ascii(b, payload, payload + 6) === 'Exif\0\0') {
      orientation = orientationFromTiff(b.subarray(payload + 6, end))
    }
    if (isFrame(marker)) {
      if (length < 8) return null
      checkJpegKind(marker, b[payload], b[payload + 5], what)
      return { height: u16be(b, payload + 1), width: u16be(b, payload + 3), orientation }
    }
    i = end
  }
  return null
}

function pngHeader(b: Uint8Array): Stored | null {
  if (b.length < 24 || ascii(b, 12, 16) !== 'IHDR') return null
  const width = u32be(b, 16)
  const height = u32be(b, 20)
  let orientation: Orientation = 1
  // An eXIf chunk counts when it comes before the image data.
  for (let i = 8; i + 8 <= b.length;) {
    const length = u32be(b, i)
    const type = ascii(b, i + 4, i + 8)
    if (type === 'IDAT' || type === 'IEND') break
    if (type === 'eXIf') {
      orientation = orientationFromTiff(b.subarray(i + 8, Math.min(b.length, i + 8 + length)))
      break
    }
    i += 12 + length
  }
  return { width, height, orientation }
}

function webpHeader(b: Uint8Array, what: string): Stored | null {
  let size: { width: number; height: number } | null = null
  let orientation: Orientation = 1
  for (let i = 12; i + 8 <= b.length;) {
    const fourcc = ascii(b, i, i + 4)
    const length = u32le(b, i + 4)
    const data = i + 8
    if (fourcc === 'VP8X') {
      if (data + 10 > b.length) return null
      if (b[data] & 0x02) {
        throw new ImageError('UNSUPPORTED_FORMAT', `${what} is an animated WebP. These packages read still images only.`)
      }
      size = { width: u24le(b, data + 4) + 1, height: u24le(b, data + 7) + 1 }
    } else if (fourcc === 'VP8 ') {
      if (data + 10 > b.length) return null
      size ??= { width: u16le(b, data + 6) & 0x3fff, height: u16le(b, data + 8) & 0x3fff }
    } else if (fourcc === 'VP8L') {
      if (data + 5 > b.length || b[data] !== 0x2f) return null
      const bits = u32le(b, data + 1)
      size ??= { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    } else if (fourcc === 'EXIF') {
      let tiff = b.subarray(data, Math.min(b.length, data + length))
      if (ascii(tiff, 0, 6) === 'Exif\0\0') tiff = tiff.subarray(6)
      orientation = orientationFromTiff(tiff)
    }
    i = data + length + (length & 1)
  }
  return size && { ...size, orientation }
}

/**
 * Reads a file's format, size and orientation from its header alone, so sizes
 * can be checked (and layouts planned) before any pixels are decoded.
 */
export function readHeader(bytes: Uint8Array, what = 'The image'): ImageHeader {
  const format = detectFormat(bytes)
  if (!format) throw unsupportedFormatError(bytes, what)
  const stored = format === 'jpeg' ? jpegHeader(bytes, what) : format === 'png' ? pngHeader(bytes) : webpHeader(bytes, what)
  if (!stored || !(stored.width > 0 && stored.height > 0)) {
    throw new ImageError(
      'DECODE_FAILED',
      `${what} looks like a ${FORMAT_LABEL[format]} file but its header can't be read. It may be damaged or cut short.`,
    )
  }
  // Orientations 5-8 turn the picture a quarter, so its upright sides swap.
  const turned = stored.orientation >= 5
  return {
    format,
    width: turned ? stored.height : stored.width,
    height: turned ? stored.width : stored.height,
    orientation: stored.orientation,
  }
}

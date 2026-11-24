// Helpers for the test suites. Never imported by package source, so it is not
// part of any build.

import { crc32, deflateSync } from 'node:zlib'
import { initEmscriptenModule } from '@jsquash/webp/utils.js'
import webpEncoderSimd from '@jsquash/webp/codec/enc/webp_enc_simd.js'
import { defaultOptions as WEBP_OPTIONS } from '@jsquash/webp/meta.js'
import { decodePixels, encodePixels } from './codecs'
import { detectFormat, type ImageFormat } from './format'
import { nodeWasmSource } from './node'
import type { Pixels } from './pixels'
import { setWasmSource } from './wasm'

/** Load the codecs from disk, as the packages' Node entry does. Call at the top of a test file. */
export function useNodeCodecs(): void {
  setWasmSource(nodeWasmSource)
}

/** A width × height image whose every pixel `paint` decides, as [r, g, b, a]. */
export function makePixels(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4)
  }
  return { data, width, height }
}

export function pixelAt(pixels: Pixels, x: number, y: number): [number, number, number, number] {
  const i = (y * pixels.width + x) * 4
  return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], pixels.data[i + 3]]
}

// Six far-apart colors, so a lossy round trip still tells them apart.
const LETTER_COLORS: Record<string, [number, number, number]> = {
  A: [255, 0, 0], B: [0, 255, 0], C: [0, 0, 255], D: [255, 255, 0], E: [0, 255, 255], F: [255, 0, 255],
}

/** A 3 × 2 image whose pixels read A B C on the top row and D E F below. */
export const LETTER_GRID: Pixels = makePixels(3, 2, (x, y) => [...LETTER_COLORS['ABCDEF'[y * 3 + x]], 255])

/** The image as rows of letters, nearest color per pixel: 'ABC/DEF' for LETTER_GRID. */
export function letters(pixels: Pixels): string {
  const rows: string[] = []
  for (let y = 0; y < pixels.height; y++) {
    let row = ''
    for (let x = 0; x < pixels.width; x++) {
      const [r, g, b] = pixelAt(pixels, x, y)
      const dist = ([cr, cg, cb]: [number, number, number]) => (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
      row += Object.keys(LETTER_COLORS).reduce((best, k) => (dist(LETTER_COLORS[k]) < dist(LETTER_COLORS[best]) ? k : best))
    }
    rows.push(row)
  }
  return rows.join('/')
}

/** The pixels as a file, at quality 100. 'webp-lossless' writes the VP8L kind of WebP. */
export async function encodeFixture(format: ImageFormat | 'webp-lossless', pixels: Pixels): Promise<Uint8Array> {
  if (format !== 'webp-lossless') return encodePixels(pixels, format, 100)
  // The packages never write lossless WebP, so this starts its own encoder for it.
  const module = await nodeWasmSource('@jsquash/webp/codec/enc/webp_enc_simd.wasm')
  const encoder = await (initEmscriptenModule as (f: unknown, m: unknown) => Promise<{ encode(d: Uint8ClampedArray, w: number, h: number, o: object): Uint8Array }>)(webpEncoderSimd, module)
  return new Uint8Array(encoder.encode(pixels.data, pixels.width, pixels.height, { ...WEBP_OPTIONS, lossless: 1 }))
}

/**
 * The TIFF block that EXIF data lives in, holding only an orientation tag
 * (0x0112, type SHORT) with the given value, in either byte order.
 */
export function tiffWithOrientation(orientation: number, order: 'II' | 'MM'): Uint8Array {
  const tiff = new Uint8Array(26)
  const view = new DataView(tiff.buffer)
  const le = order === 'II'
  tiff.set([order.charCodeAt(0), order.charCodeAt(1)], 0)
  view.setUint16(2, 42, le)
  view.setUint32(4, 8, le) // IFD0 right after the header
  view.setUint16(8, 1, le) // one entry
  view.setUint16(10, 0x0112, le)
  view.setUint16(12, 3, le) // SHORT
  view.setUint32(14, 1, le) // one value
  view.setUint16(18, orientation, le)
  view.setUint32(22, 0, le) // no next IFD
  return tiff
}

const ascii = (text: string) => [...text].map(c => c.charCodeAt(0))
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const u24le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]

/** A file with an EXIF orientation tag added where a camera would put it. */
export function withOrientation(bytes: Uint8Array, format: ImageFormat, orientation: number): Uint8Array {
  const exif = [...ascii('Exif\0\0'), ...tiffWithOrientation(orientation, 'MM')]
  if (format === 'jpeg') {
    // An APP1 segment right after the start-of-image marker.
    const length = exif.length + 2
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, ...bytes.subarray(2)])
  }
  if (format === 'png') {
    // An eXIf chunk right after IHDR, which ends at byte 33.
    const body = new Uint8Array([...ascii('eXIf'), ...tiffWithOrientation(orientation, 'MM')])
    const chunk = [...u32be(body.length - 4), ...body, ...u32be(crc32(body))]
    return new Uint8Array([...bytes.subarray(0, 33), ...chunk, ...bytes.subarray(33)])
  }
  // WebP: rebuilt as the extended format, VP8X + the image chunk + an EXIF chunk.
  const fourcc = String.fromCharCode(...bytes.subarray(12, 16))
  const size = bytes[16] | (bytes[17] << 8) | (bytes[18] << 16) | (bytes[19] << 24)
  const image = bytes.subarray(12, 20 + size + (size % 2))
  const data = bytes.subarray(20)
  let width: number
  let height: number
  if (fourcc === 'VP8 ') {
    width = (data[6] | (data[7] << 8)) & 0x3fff
    height = (data[8] | (data[9] << 8)) & 0x3fff
  } else {
    const b = (data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24)) >>> 0
    width = (b & 0x3fff) + 1
    height = ((b >>> 14) & 0x3fff) + 1
  }
  const vp8x = [...ascii('VP8X'), ...u32le(10), 0x08, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]
  const exifChunk = [...ascii('EXIF'), ...u32le(exif.length), ...exif, ...(exif.length % 2 ? [0] : [])]
  const body = [...ascii('WEBP'), ...vp8x, ...image, ...exifChunk]
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body])
}

/** One PNG chunk: length, type, data and CRC. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array([...ascii(type), ...data])
  return new Uint8Array([...u32be(data.length), ...body, ...u32be(crc32(body))])
}

/** An RGBA PNG written with node:zlib, so a test can have one before the PNG codec has ever loaded. */
export function pngFromScratch(pixels: Pixels): Uint8Array {
  const stride = pixels.width * 4 + 1
  const raw = new Uint8Array(stride * pixels.height)
  for (let y = 0; y < pixels.height; y++) raw.set(pixels.data.subarray(y * pixels.width * 4, (y + 1) * pixels.width * 4), y * stride + 1)
  const ihdr = new Uint8Array([...u32be(pixels.width), ...u32be(pixels.height), 8, 6, 0, 0, 0])
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', ihdr), ...pngChunk('IDAT', deflateSync(raw)), ...pngChunk('IEND', new Uint8Array()),
  ])
}

/** A file's pixels as stored, without applying orientation. */
export async function decodeFixture(bytes: Uint8Array): Promise<Pixels> {
  const format = detectFormat(bytes)
  if (!format) throw new Error('decodeFixture: not a JPEG, PNG or WebP')
  return decodePixels(bytes, format, 'The fixture')
}

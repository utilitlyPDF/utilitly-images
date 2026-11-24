// The codecs are jSquash's builds of Google's Squoosh codecs. Their compiled
// glue and .wasm files are used directly rather than through jSquash's
// wrappers, so this file owns each codec's lifecycle: it knows when a codec
// has really loaded, can retry one that failed to load, and can replace an
// instance that a fatal decoder error has left in a bad state.

import { initEmscriptenModule } from '@jsquash/jpeg/utils.js'
import mozjpegDecoder from '@jsquash/jpeg/codec/dec/mozjpeg_dec.js'
import mozjpegEncoder from '@jsquash/jpeg/codec/enc/mozjpeg_enc.js'
import { defaultOptions as JPEG_OPTIONS } from '@jsquash/jpeg/meta.js'
import webpDecoder from '@jsquash/webp/codec/dec/webp_dec.js'
import webpEncoderSimd from '@jsquash/webp/codec/enc/webp_enc_simd.js'
import webpEncoderPlain from '@jsquash/webp/codec/enc/webp_enc.js'
import { defaultOptions as WEBP_OPTIONS } from '@jsquash/webp/meta.js'
import initPng, { decode as pngDecode, encode as pngEncode } from '@jsquash/png/codec/pkg/squoosh_png.js'
import { ImageError } from './errors'
import { exactBuffer } from './bytes'
import { FORMAT_LABEL, type ImageFormat } from './format'
import { jpegHasEnd } from './jpeg'
import { pngIsSound } from './png'
import type { Pixels } from './pixels'
import { forget, loadOnce, type WasmFile } from './wasm'

/**
 * A default export as the value itself. The CommonJS build loads these ES
 * modules with require(), and the bundler's Node-style interop then hands over
 * the whole module object as the "default" (the value is its .default).
 * The ESM build gets the value directly.
 */
export function defaultOf<T>(imported: T): T {
  return typeof imported === 'function' ? imported : (imported as unknown as { default: T }).default
}

// Engine code has no WebAssembly types; this is the one call made here.
declare const WebAssembly: { validate(bytes: Uint8Array): boolean }

// The check wasm-feature-detect makes for SIMD: whether a module using a SIMD
// instruction validates. The WebP encoder has a SIMD build and a plain one.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])
const hasSimd = (): boolean => {
  try {
    return WebAssembly.validate(SIMD_PROBE)
  } catch {
    return false
  }
}

// Without these, MozJPEG prints warnings such as "Premature end of JPEG file"
// to the console when it meets a damaged file. The error is reported anyway.
const QUIET = { print() {}, printErr() {} }

type Decoded = { data: Uint8ClampedArray; width: number; height: number }
type JpegDecoder = { decode(data: ArrayBuffer, preserveOrientation: boolean): Decoded | null }
type WebpDecoder = { decode(data: ArrayBuffer): Decoded | null }
type Encoder = { encode(data: Uint8ClampedArray, width: number, height: number, options: object): Uint8Array | null }
type PngExports = { __wbindgen_add_to_stack_pointer(delta: number): number }

/** An Emscripten codec instance, from its factory and .wasm file. */
function emscripten<T>(key: string, name: string, file: WasmFile, factory: unknown): Promise<T> {
  return loadOnce<T>(key, name, async source => {
    const module = source ? await source(file) : undefined
    return (initEmscriptenModule as (f: unknown, m: unknown, o: object) => Promise<T>)(defaultOf(factory), module, QUIET)
  })
}

const jpegDecoderInstance = () => emscripten<JpegDecoder>('jpeg-dec', 'JPEG decoder', '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', mozjpegDecoder)
const jpegEncoderInstance = () => emscripten<Encoder>('jpeg-enc', 'JPEG encoder', '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', mozjpegEncoder)
const webpDecoderInstance = () => emscripten<WebpDecoder>('webp-dec', 'WebP decoder', '@jsquash/webp/codec/dec/webp_dec.wasm', webpDecoder)
const webpEncoderInstance = () => hasSimd()
  ? emscripten<Encoder>('webp-enc', 'WebP encoder', '@jsquash/webp/codec/enc/webp_enc_simd.wasm', webpEncoderSimd)
  : emscripten<Encoder>('webp-enc', 'WebP encoder', '@jsquash/webp/codec/enc/webp_enc.wasm', webpEncoderPlain)

// PNG is a wasm-bindgen build, shared by encoder and decoder, and a single
// instance per page or process: it can't be replaced, only kept healthy.
const pngInstance = () => loadOnce<PngExports>('png', 'PNG codec', async source => {
  const module = source ? await source('@jsquash/png/codec/pkg/squoosh_png_bg.wasm') : undefined
  return (await defaultOf(initPng)(module as never)) as unknown as PngExports
})

/**
 * Runs a call into the PNG codec. When the Rust code fails, it throws from
 * deep inside its own frames, which never get to give back their share of
 * the instance's stack; left alone, the stack runs out after some hundreds of
 * damaged files. So the stack pointer is put back where it was.
 */
function withPngStack<T>(png: PngExports, call: () => T): T {
  const stack = png.__wbindgen_add_to_stack_pointer(0)
  try {
    return call()
  } catch (err) {
    png.__wbindgen_add_to_stack_pointer(stack - png.__wbindgen_add_to_stack_pointer(0))
    throw err
  }
}

const asPixels = ({ data, width, height }: Decoded): Pixels => ({ data, width, height })

/** The image's pixels as stored (orientation is applied by the caller). */
export async function decodePixels(bytes: Uint8Array, format: ImageFormat, what: string): Promise<Pixels> {
  const damaged = (cause?: unknown) => new ImageError(
    'DECODE_FAILED',
    `${what} looks like a ${FORMAT_LABEL[format]} file but couldn't be decoded. It may be damaged or cut short.`,
    cause === undefined ? undefined : { cause },
  )
  // Damage visible from the outside is caught before a decoder sees it: both
  // would otherwise return a cut-off file as a picture with a blank part.
  if (format === 'jpeg' && !jpegHasEnd(bytes)) throw damaged()
  if (format === 'png' && !pngIsSound(bytes)) throw damaged()

  // Loading happens outside the try: a codec that can't load is not a damaged file.
  if (format === 'png') {
    const png = await pngInstance()
    try {
      return asPixels(withPngStack(png, () => pngDecode(bytes) as unknown as Decoded))
    } catch (cause) {
      throw damaged(cause)
    }
  }
  const key = format === 'jpeg' ? 'jpeg-dec' : 'webp-dec'
  const decoder = format === 'jpeg' ? await jpegDecoderInstance() : await webpDecoderInstance()
  try {
    const out = format === 'jpeg'
      ? (decoder as JpegDecoder).decode(exactBuffer(bytes), false)
      : (decoder as WebpDecoder).decode(exactBuffer(bytes))
    if (!out) throw new Error('The decoder returned no image.')
    return asPixels(out)
  } catch (cause) {
    // MozJPEG reports fatal errors by exit(), which leaves the instance's
    // memory as it was mid-call. A fresh instance is cheap; a worn one fails
    // on good files later.
    forget(key)
    throw damaged(cause)
  }
}

/** The pixels encoded as `format`. `quality` (1-100) applies to JPEG and WebP. */
export async function encodePixels(pixels: Pixels, format: ImageFormat, quality: number): Promise<Uint8Array<ArrayBuffer>> {
  if (format === 'png') {
    const png = await pngInstance()
    const { data } = pixels
    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    return withPngStack(png, () => pngEncode(rgba, pixels.width, pixels.height, 8)) as Uint8Array<ArrayBuffer>
  }
  const key = format === 'jpeg' ? 'jpeg-enc' : 'webp-enc'
  const encoder = format === 'jpeg' ? await jpegEncoderInstance() : await webpEncoderInstance()
  try {
    const options = format === 'jpeg' ? { ...JPEG_OPTIONS, quality } : { ...WEBP_OPTIONS, quality }
    const out = encoder.encode(pixels.data, pixels.width, pixels.height, options)
    if (!out) throw new Error(`The ${FORMAT_LABEL[format]} encoder returned nothing.`)
    // A copy in a buffer of its own.
    return new Uint8Array(out)
  } catch (err) {
    forget(key)
    throw err
  }
}

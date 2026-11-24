import { ImageError } from './errors'
import { toImageBytes, type ImageInput } from './bytes'
import { FORMAT_LABEL, MAX_SIDE, type ImageFormat } from './format'
import { decodePixels, encodePixels } from './codecs'
import { readHeader, type ImageHeader } from './header'
import { flatten, orient, type Pixels } from './pixels'
import type { Encoding } from './options'

/**
 * The most pixels an image, read or written, may have.
 *
 * Measured 2026-11-23 on Node.js 24.22.1 with the codecs called directly:
 * at 50 megapixels JPEG, PNG and WebP all encoded and decoded and a resize to
 * half size worked; at 100 megapixels MozJPEG aborted ("Program terminated
 * with exit(1)") while PNG, WebP and resize still worked. Half the first
 * failure leaves room for browsers, which give a page less memory.
 */
export const MAX_PIXELS = 50_000_000

const MEGAPIXELS = MAX_PIXELS / 1_000_000

/** Pixels the right way up, and the format they came in. */
export type DecodedImage = { format: ImageFormat; pixels: Pixels }

/**
 * Reads an image's bytes into upright pixels: the EXIF orientation is
 * applied, as a browser would. `what` names the image in error messages
 * ("The image", "Image 2 of 3").
 */
export async function readImage(input: ImageInput, what = 'The image'): Promise<DecodedImage> {
  const bytes = toImageBytes(input, what)
  const header = readHeader(bytes, what)
  checkInputSize(header, what)
  const stored = await decodePixels(bytes, header.format, what)
  return { format: header.format, pixels: orient(stored, header.orientation) }
}

/** Throws TOO_LARGE when an image, by its header, has more than MAX_PIXELS. */
export function checkInputSize(header: Pick<ImageHeader, 'width' | 'height'>, what: string): void {
  if (header.width * header.height > MAX_PIXELS) {
    throw new ImageError(
      'TOO_LARGE',
      `${what} is ${header.width} × ${header.height} pixels, more than the ${MEGAPIXELS} megapixels these packages handle.`,
    )
  }
}

/** Throws TOO_LARGE when `format` can't store an image this size, or it has more than MAX_PIXELS. */
export function checkOutputSize(width: number, height: number, format: ImageFormat): void {
  const max = MAX_SIDE[format]
  if (width > max || height > max) {
    throw new ImageError(
      'TOO_LARGE',
      `A ${FORMAT_LABEL[format]} can be at most ${max.toLocaleString('en-US')} pixels wide or tall; this one would be ${width} × ${height}.`,
    )
  }
  if (width * height > MAX_PIXELS) {
    throw new ImageError(
      'TOO_LARGE',
      `The result would be ${width} × ${height} pixels, more than the ${MEGAPIXELS} megapixels these packages handle.`,
    )
  }
}

/** Encodes pixels as the chosen format. JPEG has no transparency, so it gets the background color underneath. */
export async function writeImage(pixels: Pixels, encoding: Encoding): Promise<Uint8Array<ArrayBuffer>> {
  checkOutputSize(pixels.width, pixels.height, encoding.format)
  const ready = encoding.format === 'jpeg' ? flatten(pixels, encoding.background) : pixels
  return encodePixels(ready, encoding.format, encoding.quality)
}

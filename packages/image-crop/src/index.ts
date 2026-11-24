import { toImageBytes, type ImageInput } from '../../../internal/bytes'
import { ImageError } from '../../../internal/errors'
import { coverArea } from '../../../internal/geometry'
import { readHeader } from '../../../internal/header'
import { resolveEncoding, type EncodeOptions } from '../../../internal/options'
import { checkOutputSize, readImage, writeImage } from '../../../internal/pipeline'
import { cropPixels, type Area } from '../../../internal/pixels'

export { ImageError } from '../../../internal/errors'
export type { ImageErrorCode } from '../../../internal/errors'
export type { ImageInput } from '../../../internal/bytes'
export type { FormatOption, ImageFormat } from '../../../internal/format'

/** A rectangle in pixels of the upright photo, measured from its top left corner. */
export type CropArea = { x: number; y: number; width: number; height: number }

/** The largest centred area with this shape: a name, or width ÷ height. */
export type CropAspect = { aspect: '1:1' | '4:3' | '16:9' | number }

export type CropOptions = EncodeOptions

const NAMED_ASPECTS: Record<string, number> = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 }

function aspectRatio(value: unknown): number {
  const ratio = typeof value === 'string' ? NAMED_ASPECTS[value] : value
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0) {
    throw new ImageError(
      'INVALID_OPTIONS',
      `aspect must be '1:1', '4:3', '16:9' or a positive number (width ÷ height), not ${JSON.stringify(value) ?? String(value)}.`,
    )
  }
  return ratio
}

function checkedArea(area: Partial<CropArea>, width: number, height: number): Area {
  const { x, y, width: w, height: h } = area
  const whole = (n: unknown, min: number) => Number.isInteger(n) && (n as number) >= min
  if (!(whole(x, 0) && whole(y, 0) && whole(w, 1) && whole(h, 1))) {
    throw new ImageError('INVALID_OPTIONS', 'The crop area needs whole-pixel x, y, width and height, with width and height of at least 1.')
  }
  const rect = { x: x!, y: y!, width: w!, height: h! }
  if (rect.x + rect.width > width || rect.y + rect.height > height) {
    throw new ImageError(
      'INVALID_OPTIONS',
      `The crop area (x ${rect.x}, y ${rect.y}, ${rect.width} × ${rect.height}) goes past the edge of the image, which is ${width} × ${height}.`,
    )
  }
  return rect
}

/**
 * Crops an image to a rectangle, or to the largest centred area of a shape.
 *
 * Measurements are on the photo the right way up: a phone photo stored
 * sideways with an orientation tag is turned first, as a browser shows it.
 * The result keeps the input's format unless `options.format` says otherwise.
 */
export async function cropImage(image: ImageInput, area: CropArea | CropAspect, options: CropOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = toImageBytes(image)
  if (typeof area !== 'object' || area === null) {
    throw new ImageError('INVALID_OPTIONS', 'The crop area needs whole-pixel x, y, width and height, with width and height of at least 1.')
  }
  // Everything is checked from the header, before any decoding.
  const header = readHeader(bytes)
  const rect = 'aspect' in area
    ? coverArea(header.width, header.height, aspectRatio(area.aspect))
    : checkedArea(area, header.width, header.height)
  const encoding = resolveEncoding(options, header.format)
  checkOutputSize(rect.width, rect.height, encoding.format)
  const { pixels } = await readImage(bytes)
  return writeImage(cropPixels(pixels, rect), encoding)
}

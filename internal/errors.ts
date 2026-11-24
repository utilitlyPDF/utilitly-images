export type ImageErrorCode =
  /** The input wasn't a Uint8Array or ArrayBuffer. */
  | 'INVALID_INPUT'
  /** The bytes aren't a JPEG, PNG or WebP image. */
  | 'UNSUPPORTED_FORMAT'
  /** The bytes look like a supported format, but the image in them can't be read. */
  | 'DECODE_FAILED'
  /** An option was missing or out of range. */
  | 'INVALID_OPTIONS'
  /** The input or the result has more pixels, or longer sides, than can be handled. */
  | 'TOO_LARGE'

/**
 * Every failure these packages report. Check `code` rather than `instanceof`:
 * each package bundles its own copy of this class.
 */
export class ImageError extends Error {
  readonly code: ImageErrorCode

  constructor(code: ImageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ImageError'
    this.code = code
  }
}

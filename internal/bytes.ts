import { ImageError } from './errors'

/** The bytes of an image. A Node.js Buffer works too, since it is a Uint8Array. */
export type ImageInput = Uint8Array | ArrayBuffer

// Tag checks rather than instanceof, so bytes from another realm (an iframe, a
// worker, a vm context) are still recognised.
export function toImageBytes(input: ImageInput, what = 'The image'): Uint8Array {
  const tag = Object.prototype.toString.call(input)
  if (tag === '[object Uint8Array]') return input as Uint8Array
  if (tag === '[object ArrayBuffer]') return new Uint8Array(input as ArrayBuffer)
  throw new ImageError('INVALID_INPUT', `${what} must be a Uint8Array or an ArrayBuffer.`)
}

/**
 * An ArrayBuffer holding exactly these bytes. A small Node.js Buffer is a view
 * into a shared pool, so its .buffer holds other data around it; the codecs
 * take a whole ArrayBuffer, so a view that doesn't cover its buffer is copied.
 */
export function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer as ArrayBuffer
  if (bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength) return buffer
  // Not bytes.slice(): on a Buffer that's another view into the same pool.
  return new Uint8Array(bytes).buffer as ArrayBuffer
}

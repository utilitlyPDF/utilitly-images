import { describe, it, expect } from 'vitest'
import { MAX_PIXELS, checkOutputSize, readImage, writeImage } from './pipeline'
import { resolveEncoding } from './options'
import { detectFormat, type ImageFormat } from './format'
import type { Pixels } from './pixels'
import { LETTER_GRID, decodeFixture, encodeFixture, letters, makePixels, pixelAt, useNodeCodecs, withOrientation } from './testing'

useNodeCodecs()

const FORMATS: ImageFormat[] = ['jpeg', 'png', 'webp']
const gradient = makePixels(16, 8, (x, y) => [x * 16, y * 32, 128, 255])
const encoding = (format: ImageFormat, extra: { background?: string } = {}) => resolveEncoding({ format, ...extra }, format)

function expectEveryPixelNear(pixels: Pixels, [r, g, b]: [number, number, number], tolerance: number) {
  for (let i = 0; i < pixels.data.length; i += 4) {
    const got = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]]
    const off = Math.max(Math.abs(got[0] - r), Math.abs(got[1] - g), Math.abs(got[2] - b))
    if (off > tolerance) expect.fail(`pixel ${i / 4} is ${got.join(',')}, more than ${tolerance} from ${r},${g},${b}`)
  }
}

describe('readImage and writeImage', () => {
  it('round-trips every format into every format', async () => {
    for (const from of FORMATS) {
      const source = await encodeFixture(from, gradient)
      const { format, pixels } = await readImage(source)
      expect(format).toBe(from)
      expect([pixels.width, pixels.height]).toEqual([16, 8])
      for (const to of FORMATS) {
        const out = await writeImage(pixels, encoding(to))
        expect(detectFormat(out), `${from} → ${to}`).toBe(to)
        const back = await decodeFixture(out)
        expect([back.width, back.height]).toEqual([16, 8])
      }
    }
  })

  it('keeps PNG lossless', async () => {
    const { pixels } = await readImage(await encodeFixture('png', gradient))
    const back = await decodeFixture(await writeImage(pixels, encoding('png')))
    expect([...back.data]).toEqual([...gradient.data])
  })

  it('decodes a view at a non-zero offset, not its whole buffer', async () => {
    const png = await encodeFixture('png', gradient)
    const big = new Uint8Array(png.length + 64)
    big.set(png, 32)
    const fromView = await readImage(big.subarray(32, 32 + png.length))
    expect([fromView.pixels.width, fromView.pixels.height]).toEqual([16, 8])
    // A small Buffer is a view into Node's shared pool.
    const pooled = Buffer.from(png)
    const fromBuffer = await readImage(pooled)
    expect([fromBuffer.pixels.width, fromBuffer.pixels.height]).toEqual([16, 8])
  })

  it('takes an ArrayBuffer as well as a Uint8Array', async () => {
    const png = await encodeFixture('png', gradient)
    const { pixels } = await readImage(png.slice().buffer)
    expect([pixels.width, pixels.height]).toEqual([16, 8])
  })

  it('puts the background under transparency in JPEG', async () => {
    const clear = makePixels(8, 8, () => [255, 0, 0, 0])
    const { pixels } = await readImage(await encodeFixture('png', clear))
    expectEveryPixelNear(await decodeFixture(await writeImage(pixels, encoding('jpeg', { background: '#00ff00' }))), [0, 255, 0], 8)
    expectEveryPixelNear(await decodeFixture(await writeImage(pixels, encoding('jpeg'))), [255, 255, 255], 8)
  })

  it('names formats it does not read', async () => {
    await expect(readImage(new TextEncoder().encode('GIF89a\x01\x00\x01\x00'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
      message: expect.stringContaining('GIF'),
    })
    await expect(readImage(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
      message: "The image isn't a JPEG, PNG or WebP image.",
    })
  })

  it('rejects input that is not bytes', async () => {
    await expect(readImage('x' as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('orientation', () => {
  it('returns upright pixels for every orientation', async () => {
    const UPRIGHT = ['ABC/DEF', 'CBA/FED', 'FED/CBA', 'DEF/ABC', 'AD/BE/CF', 'DA/EB/FC', 'FC/EB/DA', 'CF/BE/AD']
    const png = await encodeFixture('png', LETTER_GRID)
    for (let o = 1; o <= 8; o++) {
      const { pixels } = await readImage(withOrientation(png, 'png', o))
      expect(letters(pixels), `orientation ${o}`).toBe(UPRIGHT[o - 1])
    }
  })

  it('rotates a JPEG with orientation 6', async () => {
    // Stored 40 × 20: red on the left, blue on the right. A quarter turn clockwise puts red on top.
    const stored = makePixels(40, 20, x => (x < 20 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const { pixels } = await readImage(withOrientation(await encodeFixture('jpeg', stored), 'jpeg', 6))
    expect([pixels.width, pixels.height]).toEqual([20, 40])
    const [r1, , b1] = pixelAt(pixels, 10, 5)
    const [r2, , b2] = pixelAt(pixels, 10, 35)
    expect(r1).toBeGreaterThan(239)
    expect(b1).toBeLessThan(17)
    expect(r2).toBeLessThan(17)
    expect(b2).toBeGreaterThan(239)
  })
})

describe('size limits', () => {
  it('refuses an image over MAX_PIXELS before decoding it', async () => {
    // A PNG signature and an IHDR claiming 100,000 × 100,000, and no image data:
    // decoding would fail with DECODE_FAILED, so TOO_LARGE shows the check came first.
    const ihdr = [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 1, 0x86, 0xa0, 0, 1, 0x86, 0xa0, 8, 6, 0, 0, 0, 0, 0, 0, 0]
    const huge = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr])
    await expect(readImage(huge)).rejects.toMatchObject({
      code: 'TOO_LARGE',
      message: expect.stringMatching(/^The image is 100000 × 100000 pixels, more than the \d+ megapixels these packages handle\.$/),
    })
  })

  it('refuses a result over MAX_PIXELS', () => {
    const rows = MAX_PIXELS / 10_000
    expect(() => checkOutputSize(10_000, rows, 'png')).not.toThrow()
    expect(() => checkOutputSize(10_000, rows + 1, 'png')).toThrow(expect.objectContaining({
      code: 'TOO_LARGE',
      message: expect.stringMatching(/^The result would be 10000 × \d+ pixels/),
    }))
  })

  it('refuses sizes past a format limit before encoding', async () => {
    expect(() => checkOutputSize(16_384, 1, 'webp')).toThrow(expect.objectContaining({ code: 'TOO_LARGE', message: expect.stringContaining('16,383') }))
    expect(() => checkOutputSize(1, 16_384, 'webp')).toThrow(expect.objectContaining({ code: 'TOO_LARGE' }))
    expect(() => checkOutputSize(16_383, 1, 'webp')).not.toThrow()
    expect(() => checkOutputSize(65_501, 1, 'jpeg')).toThrow(expect.objectContaining({ code: 'TOO_LARGE', message: expect.stringContaining('65,500') }))
    expect(() => checkOutputSize(70_000, 1, 'png')).not.toThrow()
    await expect(writeImage(makePixels(16_384, 1, () => [0, 0, 0, 255]), encoding('webp'))).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })
})

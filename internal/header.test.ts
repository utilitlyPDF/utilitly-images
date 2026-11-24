import { describe, it, expect } from 'vitest'
import { readHeader } from './header'
import { encodeFixture, makePixels, useNodeCodecs, withOrientation } from './testing'

useNodeCodecs()

const picture = makePixels(30, 20, (x, y) => [x * 8, y * 12, 60, 255])
const ascii = (text: string) => [...text].map(c => c.charCodeAt(0))
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

describe('readHeader', () => {
  it('reads the size of every kind of file', async () => {
    expect(readHeader(await encodeFixture('jpeg', picture))).toEqual({ format: 'jpeg', width: 30, height: 20, orientation: 1 })
    expect(readHeader(await encodeFixture('png', picture))).toEqual({ format: 'png', width: 30, height: 20, orientation: 1 })
    expect(readHeader(await encodeFixture('webp', picture))).toEqual({ format: 'webp', width: 30, height: 20, orientation: 1 })
    expect(readHeader(await encodeFixture('webp-lossless', picture))).toEqual({ format: 'webp', width: 30, height: 20, orientation: 1 })
  })

  it('reads the orientation and reports the upright size', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const turned = withOrientation(await encodeFixture(format, picture), format, 6)
      expect(readHeader(turned), format).toEqual({ format, width: 20, height: 30, orientation: 6 })
    }
    const mirrored = withOrientation(await encodeFixture('jpeg', picture), 'jpeg', 2)
    expect(readHeader(mirrored)).toEqual({ format: 'jpeg', width: 30, height: 20, orientation: 2 })
  })

  it('reports a header it cannot read as DECODE_FAILED', async () => {
    const png = await encodeFixture('png', picture)
    expect(() => readHeader(png.subarray(0, 20))).toThrow(expect.objectContaining({
      code: 'DECODE_FAILED',
      message: "The image looks like a PNG file but its header can't be read. It may be damaged or cut short.",
    }))
    // Start and end of image, with nothing that says how big it is.
    expect(() => readHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'Image 2 of 2')).toThrow(expect.objectContaining({
      code: 'DECODE_FAILED',
      message: expect.stringMatching(/^Image 2 of 2 looks like a JPEG file/),
    }))
    const webp = await encodeFixture('webp', picture)
    expect(() => readHeader(webp.subarray(0, 22))).toThrow(expect.objectContaining({ code: 'DECODE_FAILED' }))
  })

  it('refuses JPEG kinds the decoder cannot read, by name', async () => {
    const jpeg = await encodeFixture('jpeg', picture)
    // The frame header: FF Cn, length, then precision, height, width, component count.
    let sof = 2
    while (!(jpeg[sof + 1] >= 0xc0 && jpeg[sof + 1] <= 0xc2)) sof += 2 + ((jpeg[sof + 2] << 8) | jpeg[sof + 3])
    const edited = (at: number, value: number) => {
      const copy = jpeg.slice()
      copy[at] = value
      return copy
    }
    const unsupported = (bytes: Uint8Array, kind: string) =>
      expect(() => readHeader(bytes)).toThrow(expect.objectContaining({
        code: 'UNSUPPORTED_FORMAT',
        message: `The image is ${kind}, which these packages can't read. Save it as an ordinary RGB JPEG first.`,
      }))
    unsupported(edited(sof + 9, 4), 'a CMYK JPEG')
    unsupported(edited(sof + 4, 12), 'a 12-bit JPEG')
    unsupported(edited(sof + 1, 0xc3), 'a lossless JPEG')
    unsupported(edited(sof + 9, 2), 'a JPEG with 2 color channels')
  })

  it('refuses an animated WebP', () => {
    const vp8x = [...ascii('VP8X'), ...u32le(10), 0x02, 0, 0, 0, 9, 0, 0, 9, 0, 0]
    const animated = new Uint8Array([...ascii('RIFF'), ...u32le(4 + vp8x.length), ...ascii('WEBP'), ...vp8x])
    expect(() => readHeader(animated)).toThrow(expect.objectContaining({
      code: 'UNSUPPORTED_FORMAT',
      message: 'The image is an animated WebP. These packages read still images only.',
    }))
  })

  it('names formats it does not read', () => {
    expect(() => readHeader(new Uint8Array(ascii('GIF89a')))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT', message: expect.stringContaining('GIF') }))
  })
})

// Its own file, so the codecs start up after the spies below are in place:
// Emscripten binds console when a codec starts, so a spy added later in a
// file whose codecs were already running would never see a call.

import { afterAll, beforeAll, describe, it, expect, vi, type MockInstance } from 'vitest'
import { readImage } from './pipeline'
import { encodeFixture, makePixels, useNodeCodecs } from './testing'

useNodeCodecs()

const spies: MockInstance[] = []
beforeAll(() => {
  for (const method of ['log', 'info', 'warn', 'error'] as const) spies.push(vi.spyOn(console, method))
  spies.push(vi.spyOn(process.stdout, 'write'), vi.spyOn(process.stderr, 'write'))
})
afterAll(() => {
  for (const spy of spies) spy.mockRestore()
})

describe('damaged files', () => {
  it('are reported as DECODE_FAILED, silently, and the codecs keep working', async () => {
    const picture = makePixels(64, 64, (x, y) => [x * 4, y * 4, 90, 255])
    const jpeg = await encodeFixture('jpeg', picture)
    const webp = await encodeFixture('webp', picture)
    const png = await encodeFixture('png', picture)
    // Encoding the fixtures starts the encoders, which may print nothing either.
    for (const spy of spies) spy.mockClear()

    await expect(readImage(jpeg.subarray(0, 300))).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    // Cut off late in its image data: MozJPEG alone would fill the rest with gray and succeed.
    await expect(readImage(jpeg.subarray(0, jpeg.length - 200))).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    await expect(readImage(webp.subarray(0, 40))).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    // Signature and IHDR only: 8 + 25 bytes, no image data.
    await expect(readImage(png.subarray(0, 33))).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    await expect(readImage(jpeg.subarray(0, 300))).rejects.toMatchObject({
      message: "The image looks like a JPEG file but couldn't be decoded. It may be damaged or cut short.",
    })

    for (const spy of spies) expect(spy).not.toHaveBeenCalled()

    const { pixels } = await readImage(jpeg)
    expect([pixels.width, pixels.height]).toEqual([64, 64])
  })
})

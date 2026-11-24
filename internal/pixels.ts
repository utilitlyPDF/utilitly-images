import type { Orientation } from './exif'

/** Decoded pixels: 4 bytes per pixel, red, green, blue, alpha, row by row from the top left. */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number }

export type Rgb = { r: number; g: number; b: number }

/** A rectangle of whole pixels. */
export type Area = { x: number; y: number; width: number; height: number }

/** The pixels turned and mirrored as the EXIF orientation says, so they read upright. */
export function orient(pixels: Pixels, orientation: Orientation): Pixels {
  if (orientation === 1) return pixels
  const { data, width: w, height: h } = pixels
  const turned = orientation >= 5
  const outWidth = turned ? h : w
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Where stored pixel (x, y) lands in the upright picture.
      let ux: number
      let uy: number
      switch (orientation) {
        case 2: ux = w - 1 - x; uy = y; break // mirrored left to right
        case 3: ux = w - 1 - x; uy = h - 1 - y; break // turned 180°
        case 4: ux = x; uy = h - 1 - y; break // mirrored top to bottom
        case 5: ux = y; uy = x; break // transposed
        case 6: ux = h - 1 - y; uy = x; break // turned 90° clockwise
        case 7: ux = h - 1 - y; uy = w - 1 - x; break // transverse
        default: ux = y; uy = w - 1 - x // 8: turned 90° counter-clockwise
      }
      const from = (y * w + x) * 4
      const to = (uy * outWidth + ux) * 4
      out[to] = data[from]
      out[to + 1] = data[from + 1]
      out[to + 2] = data[from + 2]
      out[to + 3] = data[from + 3]
    }
  }
  return { data: out, width: outWidth, height: turned ? w : h }
}

/** A copy of one rectangle of the pixels. The area must lie inside them. */
export function cropPixels(pixels: Pixels, area: Area): Pixels {
  const { x, y, width, height } = area
  const out = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * pixels.width + x) * 4
    out.set(pixels.data.subarray(from, from + width * 4), row * width * 4)
  }
  return { data: out, width, height }
}

/** The image drawn over a solid background: what JPEG, which has no transparency, gets. */
export function flatten(pixels: Pixels, background: Rgb): Pixels {
  const src = pixels.data
  const out = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    out[i] = (src[i] * a + background.r * (255 - a)) / 255
    out[i + 1] = (src[i + 1] * a + background.g * (255 - a)) / 255
    out[i + 2] = (src[i + 2] * a + background.b * (255 - a)) / 255
    out[i + 3] = 255
  }
  return { data: out, width: pixels.width, height: pixels.height }
}

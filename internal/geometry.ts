import type { Area } from './pixels'

/**
 * The largest centred area of an image with the given shape (width ÷ height),
 * in whole pixels and at least 1 × 1. What a "cover" fit shows: the middle of
 * the picture, with the excess trimmed evenly from two opposite edges.
 */
export function coverArea(srcWidth: number, srcHeight: number, ratio: number): Area {
  let width = srcWidth
  let height = srcHeight
  if (srcWidth / srcHeight > ratio) width = Math.min(srcWidth, Math.max(1, Math.round(srcHeight * ratio)))
  else height = Math.min(srcHeight, Math.max(1, Math.round(srcWidth / ratio)))
  return { x: Math.floor((srcWidth - width) / 2), y: Math.floor((srcHeight - height) / 2), width, height }
}

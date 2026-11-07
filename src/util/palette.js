/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

import { FALLBACK_PALETTE } from '../scene/defaults.js';
import { clamp } from '../util/math.js';

function normalizeRgb(value) {
    if (Array.isArray(value)) {
      return { r: Number(value[0]) || 0, g: Number(value[1]) || 0, b: Number(value[2]) || 0 };
    }
    return { r: Number(value && value.r) || 0, g: Number(value && value.g) || 0, b: Number(value && value.b) || 0 };
  }

  function normalizePalette(value) {
    const source = value || FALLBACK_PALETTE;
    const accents = Array.isArray(source.accents) && source.accents.length
      ? source.accents.map(normalizeRgb)
      : [normalizeRgb(source.dominant || FALLBACK_PALETTE.dominant)];
    return {
      dominant: normalizeRgb(source.dominant || FALLBACK_PALETTE.dominant),
      accents: accents
    };
  }

  function rgbSaturation(color) {
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    return max === 0 ? 0 : (max - min) / max;
  }

  function rgbLuminance(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  }

  function toDrawable(source) {
    if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext('2d').putImageData(source, 0, 0);
      return canvas;
    }
    return source;
  }

  function sourceSize(source) {
    return {
      w: source.videoWidth || source.naturalWidth || source.width || 1,
      h: source.videoHeight || source.naturalHeight || source.height || 1
    };
  }

  function extractPalette(source, sampleSide) {
    const side = Math.max(2, Math.min(64, Math.round(sampleSide || 32)));
    try {
      const drawable = toDrawable(source);
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.interpolationQuality = 'medium';
      ctx.drawImage(drawable, 0, 0, side, side);
      const pixels = ctx.getImageData(0, 0, side, side).data;
      const histogram = new Map();
      const centre = side / 2;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const i = (y * side + x) * 4;
          const r = pixels[i] / 255;
          const g = pixels[i + 1] / 255;
          const b = pixels[i + 2] / 255;
          const dx = (x - centre) / centre;
          const dy = (y - centre) / centre;
          const weight = 1.5 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
          const key = ((pixels[i] >> 4) << 8) | ((pixels[i + 1] >> 4) << 4) | (pixels[i + 2] >> 4);
          let bucket = histogram.get(key);
          if (!bucket) {
            bucket = { count: 0, r: 0, g: 0, b: 0 };
            histogram.set(key, bucket);
          }
          bucket.count += weight;
          bucket.r += r * weight;
          bucket.g += g * weight;
          bucket.b += b * weight;
        }
      }
      const colours = Array.from(histogram.values())
        .sort(function (a, b) { return b.count - a.count; })
        .map(function (bucket) {
          return { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count };
        });
      if (!colours.length) return normalizePalette(FALLBACK_PALETTE);
      const accents = colours.filter(function (colour) {
        const luminance = rgbLuminance(colour);
        return rgbSaturation(colour) > 0.25 && luminance > 0.15 && luminance < 0.85;
      }).slice(0, 3);
      return normalizePalette({
        dominant: colours[0],
        accents: accents.length ? accents : [colours[0]]
      });
    } catch (error) {
      return normalizePalette(FALLBACK_PALETTE);
    }
  }

  function paletteCss(color) {
    return 'rgb(' + Math.round(clamp(color.r, 0, 1) * 255) + ',' +
      Math.round(clamp(color.g, 0, 1) * 255) + ',' +
      Math.round(clamp(color.b, 0, 1) * 255) + ')';
  }

  function makePaletteImage(palette) {
    const side = 64;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    const stops = [palette.dominant].concat(palette.accents).slice(0, 3);
    const gradient = ctx.createLinearGradient(0, 0, side, side);
    stops.forEach(function (colour, index) {
      gradient.addColorStop(stops.length === 1 ? 0 : index / (stops.length - 1), paletteCss(colour));
    });
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, side, side);
    return canvas;
  }

export { normalizeRgb, normalizePalette, rgbSaturation, rgbLuminance, toDrawable, sourceSize, extractPalette, paletteCss, makePaletteImage };

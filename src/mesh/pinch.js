/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

import { LANDSCAPE_GRID_DATA, PORTRAIT_GRID_DATA } from '../mesh/grids.js';
import { clamp } from '../util/math.js';
import { pairIndex } from '../util/seed.js';

function subdivide(points, cells) {
    const width = 2 * cells + 1;
    const point = function (i, j) { return points[j * (cells + 1) + i]; };
    const face = function (i, j) {
      const a = point(i, j);
      const b = point(i + 1, j);
      const c = point(i, j + 1);
      const d = point(i + 1, j + 1);
      return [(a[0] + b[0] + c[0] + d[0]) * 0.25, (a[1] + b[1] + c[1] + d[1]) * 0.25];
    };
    const q = new Array(width * width);
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        q[(2 * j + 1) * width + 2 * i + 1] = face(i, j);
      }
    }
    for (let j = 0; j <= cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = point(i, j);
        const b = point(i + 1, j);
        const ex = a[0] + b[0];
        const ey = a[1] + b[1];
        if (j === 0 || j === cells) {
          q[2 * j * width + 2 * i + 1] = [ex * 0.5, ey * 0.5];
        } else {
          const f1 = face(i, j - 1);
          const f2 = face(i, j);
          q[2 * j * width + 2 * i + 1] = [(ex + f1[0] + f2[0]) * 0.25, (ey + f1[1] + f2[1]) * 0.25];
        }
      }
    }
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i <= cells; i++) {
        const a = point(i, j);
        const b = point(i, j + 1);
        const ex = a[0] + b[0];
        const ey = a[1] + b[1];
        if (i === 0 || i === cells) {
          q[(2 * j + 1) * width + 2 * i] = [ex * 0.5, ey * 0.5];
        } else {
          const f1 = face(i - 1, j);
          const f2 = face(i, j);
          q[(2 * j + 1) * width + 2 * i] = [(ex + f1[0] + f2[0]) * 0.25, (ey + f1[1] + f2[1]) * 0.25];
        }
      }
    }
    for (let j = 0; j <= cells; j++) {
      for (let i = 0; i <= cells; i++) {
        const v = point(i, j);
        const edgeY = j === 0 || j === cells;
        const edgeX = i === 0 || i === cells;
        let result;
        if (edgeY && edgeX) {
          result = [v[0], v[1]];
        } else if (edgeY) {
          const a = point(i - 1, j);
          const b = point(i + 1, j);
          result = [(a[0] + 6 * v[0] + b[0]) / 8, (a[1] + 6 * v[1] + b[1]) / 8];
        } else if (edgeX) {
          const a = point(i, j - 1);
          const b = point(i, j + 1);
          result = [(a[0] + 6 * v[0] + b[0]) / 8, (a[1] + 6 * v[1] + b[1]) / 8];
        } else {
          const f1 = face(i - 1, j - 1);
          const f2 = face(i, j - 1);
          const f3 = face(i - 1, j);
          const f4 = face(i, j);
          const facesX = (f1[0] + f2[0] + f3[0] + f4[0]) * 0.25;
          const facesY = (f1[1] + f2[1] + f3[1] + f4[1]) * 0.25;
          const a = point(i - 1, j);
          const b = point(i + 1, j);
          const c = point(i, j - 1);
          const d = point(i, j + 1);
          const neighboursX = (a[0] + b[0] + c[0] + d[0]) * 0.25;
          const neighboursY = (a[1] + b[1] + c[1] + d[1]) * 0.25;
          result = [
            (facesX + neighboursX + 2 * v[0]) * 0.25,
            (facesY + neighboursY + 2 * v[1]) * 0.25
          ];
        }
        q[2 * j * width + 2 * i] = result;
      }
    }
    return q;
  }

  function makePinchMesh(landscape, seed, strength) {
    const pair = (landscape ? LANDSCAPE_GRID_DATA : PORTRAIT_GRID_DATA)[pairIndex(seed)];
    const cells = landscape ? 8 : 5;
    const s = clamp(strength == null ? 1 : strength, 0, 1);
    const controlPoints = function (data) {
      const count = (cells + 1) * (cells + 1);
      const result = new Array(count);
      for (let k = 0; k < count; k++) {
        const fx = (k % (cells + 1)) / cells;
        const fy = Math.floor(k / (cells + 1)) / cells;
        const px = data[2 * k];
        const py = data[2 * k + 1];
        result[k] = [(fx + (px - fx) * s) * 2 - 1, (fy + (py - fy) * s) * 2 - 1];
      }
      return result;
    };
    let from = controlPoints(pair.from);
    let to = controlPoints(pair.to);
    let n = cells;
    for (let level = 0; level < 2; level++) {
      from = subdivide(from, n);
      to = subdivide(to, n);
      n *= 2;
    }
    const width = n + 1;
    const count = width * width;
    const vertices = new Float32Array(count * 6);
    for (let k = 0; k < count; k++) {
      const o = k * 6;
      vertices[o] = (k % width) / n;
      vertices[o + 1] = Math.floor(k / width) / n;
      vertices[o + 2] = from[k][0];
      vertices[o + 3] = from[k][1];
      vertices[o + 4] = to[k][0];
      vertices[o + 5] = to[k][1];
    }
    const indices = new Uint16Array(n * n * 6);
    let offset = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * width + i;
        const b = a + 1;
        const d = a + width;
        const c = d + 1;
        indices[offset++] = a;
        indices[offset++] = c;
        indices[offset++] = d;
        indices[offset++] = a;
        indices[offset++] = b;
        indices[offset++] = c;
      }
    }
    return { vertices: vertices, indices: indices, width: width };
  }

export { subdivide, makePinchMesh };

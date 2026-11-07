/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function m4identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  function m4diag(x, y, z, w) {
    return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, w]);
  }

  function m4translation(x, y) {
    const m = m4identity();
    m[12] = x;
    m[13] = y;
    return m;
  }

  function m4rotation(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  function m4multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4];
      const b1 = b[c * 4 + 1];
      const b2 = b[c * 4 + 2];
      const b3 = b[c * 4 + 3];
      out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  function bezier(t, a, b) {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  }

  function cubicSolve(x, p1x, p1y, p2x, p2y) {
    x = clamp(x, 0, 1);
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const cx = bezier(t, p1x, p2x) - x;
      const u = 1 - t;
      const dx = 3 * u * u * p1x + 6 * u * t * (p2x - p1x) + 3 * t * t * (1 - p2x);
      if (Math.abs(cx) < 1e-5 || dx === 0) break;
      t -= cx / dx;
      t = clamp(t, 0, 1);
    }
    return bezier(t, p1y, p2y);
  }

  function easeOut(x) {
    return cubicSolve(x, 0, 0, 0.3, 1);
  }

  function easeInOut(x) {
    return cubicSolve(x, 0.42, 0, 0.58, 1);
  }

export { clamp, m4identity, m4diag, m4translation, m4rotation, m4multiply, bezier, cubicSolve, easeOut, easeInOut };

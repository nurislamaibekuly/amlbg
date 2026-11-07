/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

function seedFromString(value) {
    const bytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(String(value))
      : Array.from(String(value), function (c) { return c.charCodeAt(0) & 0xff; });
    let hash = 14695981039346656037n;
    for (let i = 0; i < bytes.length; i++) {
      hash = ((hash ^ BigInt(bytes[i])) * 1099511628211n) & 0xffffffffffffffffn;
    }
    return hash;
  }

  function pairIndex(seed) {
    let value;
    if (typeof seed === 'bigint') value = seed;
    else if (typeof seed === 'string') value = seedFromString(seed);
    else value = BigInt(Math.trunc(Number(seed) || 0));
    return Number(((value % 5n) + 5n) % 5n);
  }

export { seedFromString, pairIndex };

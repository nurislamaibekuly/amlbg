/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

import { clamp } from '../util/math.js';

function SpectrumPower() {
    this.levels = [0, 0, 0, 0];
    this.smoothed = [0, 0, 0, 0];
  }

  SpectrumPower.prototype.update = function (input, dt) {
    const frames = Math.max(0, dt) * 60;
    const decay = [
      Math.pow(1 - 1 / 50, frames),
      Math.pow(1 - 1 / 100, frames),
      Math.pow(1 - 1 / 1000, frames),
      0
    ];
    for (let i = 0; i < 4; i++) {
      this.levels[i] = Math.max(this.levels[i] * decay[i], clamp(input[i] || 0, 0, 1));
    }
    const k = 1 - Math.pow(0.5, frames);
    for (let i = 0; i < 4; i++) {
      this.smoothed[i] += (this.levels[i] - this.smoothed[i]) * k;
    }
  };

  SpectrumPower.prototype.reset = function () {
    this.levels = [0, 0, 0, 0];
    this.smoothed = [0, 0, 0, 0];
  };

  SpectrumPower.prototype.power = function (intensity) {
    const out = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const x = clamp(this.smoothed[i] * intensity, 0, 1);
      out[i] = x * x * x * (x * (x * 6 - 15) + 10);
    }
    return out;
  };

  function blurRadius(landscape, exciting) {
    if (landscape) return exciting ? 120 : 200;
    return exciting ? 85 : 160;
  }

  function saturation(landscape, exciting) {
    if (landscape) return exciting ? 2.4 : 2.9;
    return exciting ? 2.0 : 2.4;
  }

export { SpectrumPower, blurRadius, saturation };

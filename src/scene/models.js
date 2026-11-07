/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

import { m4diag, m4multiply, m4rotation, m4translation } from '../util/math.js';

const MODELS = [
    { matrix: m4diag(1.4, 1.4, 1, 1), parent: null, period: 120 },
    { matrix: m4multiply(m4translation(-0.25, 0.15), m4diag(0.7, 0.7, 1, 1)), parent: null, period: 70 },
    { matrix: m4multiply(m4translation(0.7, 0.7), m4diag(0.7, 0.7, 1, 1)), parent: 0, period: 90 }
  ];

  function viewMatrix(aspect) {
    return aspect >= 1 ? m4diag(1, aspect, 1, 1) : m4diag(1 / aspect, 1, 1, 1);
  }

  function spectrumScale(power) {
    const m = power[0] + (power[1] - power[0]) * 0.1;
    return 1 + m * m * 0.33;
  }

  function instanceMatrix(index, time, aspect, power) {
    const model = MODELS[index];
    const angle = 2 * Math.PI * time;
    const s = spectrumScale(power);
    let m = m4multiply(m4diag(s, s, 1, 1), viewMatrix(aspect));
    if (model.parent !== null) {
      m = m4multiply(m, m4rotation(angle / MODELS[model.parent].period));
    }
    return m4multiply(m4multiply(m, model.matrix), m4rotation(angle / model.period));
  }

export { MODELS, viewMatrix, spectrumScale, instanceMatrix };

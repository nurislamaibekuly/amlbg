/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

const FALLBACK_PALETTE = {
    dominant: { r: 0.078, g: 0.078, b: 0.11 },
    accents: [{ r: 0.996, g: 0.475, b: 0.443 }]
  };

  const DEFAULT_PARAMETERS = {
    motion: 'auto',
    speed: 1,
    blurScale: 1,
    saturationScale: 1,
    brightness: 1,
    blackScrim: 0.5,
    whiteScrim: 0.1,
    audioReactivity: 1,
    pinchStrength: 1,
    colorGrade: true,
    framesPerSecond: 30,
    renderScale: 0.5
  };

  const BLEND_SIZE = 512;
  const BLUR_DOWNSAMPLE = 4;
  const MAX_BLUR_RADIUS = 512;
  const instanceScrimStep = 0.0075;
  const warpPeriodDivisor = 3.5;
  const transitionDuration = 0.8;
  const blurRadiusPointsPerSecond = 60;

export { FALLBACK_PALETTE, DEFAULT_PARAMETERS, BLEND_SIZE, BLUR_DOWNSAMPLE, MAX_BLUR_RADIUS, instanceScrimStep, warpPeriodDivisor, transitionDuration, blurRadiusPointsPerSecond };

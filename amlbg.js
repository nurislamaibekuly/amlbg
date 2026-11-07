/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */
import { MeshBackdrop } from './src/core/backdrop.js';
import { extractPalette, normalizePalette } from './src/util/palette.js';
import { FALLBACK_PALETTE } from './src/scene/defaults.js';
import { makePinchMesh } from './src/mesh/pinch.js';
import { pairIndex, seedFromString } from './src/util/seed.js';

MeshBackdrop.extractPalette = extractPalette;
MeshBackdrop.fallbackPalette = normalizePalette(FALLBACK_PALETTE);
MeshBackdrop.makePinchMesh = makePinchMesh;
MeshBackdrop.pairIndex = pairIndex;
MeshBackdrop.seedFromString = seedFromString;
MeshBackdrop.version = '1.0.0';
MeshBackdrop.default = MeshBackdrop;

export default MeshBackdrop;
export { MeshBackdrop };

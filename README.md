# amlbg

Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
Full-page animated background: rotating artwork, separable gaussian bloom, and a
Catmull-Clark pinch warp.

- WebGL2, zero dependencies, ES modules
- Faithful gaussian blur (separable, zero-edge, half-float intermediates, half-texel sigma quantization)
- Seeded pinch-mesh warp with 5 landscape + 5 portrait grid pairs
- Palette extraction from artwork, color grade + ordered dither, crossfade transitions

## Usage

```js
import MeshBackdrop from './amlbg.js';

const backdrop = new MeshBackdrop(canvas, {
  seed: 'aurora',                 // selects the pinch-mesh pair
  cover: imageElementOrCanvas,    // initial artwork (optional)
  autoStart: true,                // call play() yourself if false
  parameters: {
    motion: 'auto',               // 'auto' | 'subdued' | 'exciting'
    renderScale: 0.5,             // internal resolution scale
    blurScale: 1,                 // multiplier on the bloom radius
    pinchStrength: 1,
    speed: 1,
    saturationScale: 1,
    brightness: 1,
    audioReactivity: 1,
    framesPerSecond: 30,
    colorGrade: true
  },
  energyProvider: () => [low, mid, high, peak]  // optional audio energy
});
```

### Methods

| Method | Description |
| --- | --- |
| `setCover(source, seed?)` | Swap artwork (crossfades; seed re-rolls the mesh pair) |
| `setPalette(value)` | Override the palette (defaults to extracted/fallback) |
| `setSeed(value)` | Change the mesh seed |
| `setParameters(values)` | Update rendering parameters |
| `setEnergy(value)` / `energyProvider` | Drive the audio-reactive scale |
| `setBehindLyrics(bool)` | Force the `exciting` intensity while lyrics are up |
| `play()` / `pause()` / `renderOnce(dt?)` | Animation control |
| `destroy()` | Release GL resources and listeners |

### Statics

`MeshBackdrop.extractPalette(source, sampleSide)`, `MeshBackdrop.fallbackPalette`,
`MeshBackdrop.pairIndex(seed)`, `MeshBackdrop.seedFromString(value)`,
`MeshBackdrop.makePinchMesh(landscape, seed, strength)`.

## Demo

```sh
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

## Structure

```
amlbg.js            public entry point
src/core/           backdrop pipeline, audio spectrum
src/mesh/           pinch grid data, mesh generation
src/render/         GLSL programs, GL helpers
src/scene/          defaults, constants, view models
src/util/           math, palette extraction, seeding
```

## License

AGPL-3.0-only — see [LICENSE](LICENSE).

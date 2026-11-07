/* SPDX-License-Identifier: AGPL-3.0-only
 * amlbg — Reverse-engineered Apple Music animated backdrops, ported to JavaScript.
 */

import { SpectrumPower, blurRadius, saturation } from '../core/spectrum.js';
import { makePinchMesh } from '../mesh/pinch.js';
import { createProgram, createRenderTexture, deleteRenderTexture } from '../render/gl.js';
import { BLEND_FS, BLUR_FS, FULLSCREEN_VS, PINCH_FS, PINCH_VS, ROTATE_FS, ROTATE_VS } from '../render/shaders.js';
import { BLEND_SIZE, BLUR_DOWNSAMPLE, DEFAULT_PARAMETERS, FALLBACK_PALETTE, MAX_BLUR_RADIUS, blurRadiusPointsPerSecond, instanceScrimStep, transitionDuration, warpPeriodDivisor } from '../scene/defaults.js';
import { instanceMatrix } from '../scene/models.js';
import { clamp, easeInOut, easeOut } from '../util/math.js';
import { makePaletteImage, normalizePalette, sourceSize, toDrawable } from '../util/palette.js';
import { seedFromString } from '../util/seed.js';

class MeshBackdrop {
    constructor(canvas, options) {
      options = options || {};
      if (!canvas) throw new Error('MeshBackdrop requires a canvas element');
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
      if (!gl) throw new Error('MeshBackdrop requires WebGL2');
      this.canvas = canvas;
      this.gl = gl;
      this.halfFloat = Boolean(
        gl.getExtension('EXT_color_buffer_float') ||
        gl.getExtension('EXT_color_buffer_half_float')
      );
      this.parameters = Object.assign({}, DEFAULT_PARAMETERS, options.parameters || {});
      this._normalizeParameters();
      this.palette = normalizePalette(options.palette || FALLBACK_PALETTE);
      this._seedName = options.seed != null ? String(options.seed) : null;
      this.meshSeed = this._seedName != null ? seedFromString(this._seedName) : 1n;
      this.meshLandscape = null;
      this.meshDirty = true;
      this.energy = options.energy ? options.energy.slice(0, 4) : [0, 0, 0, 0];
      while (this.energy.length < 4) this.energy.push(0);
      this.energyProvider = typeof options.energyProvider === 'function' ? options.energyProvider : null;
      this.isBehindLyrics = Boolean(options.isBehindLyrics);
      this._reduceMotionQuery = typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      this._reduceMotion = Boolean(this._reduceMotionQuery && this._reduceMotionQuery.matches);
      this._onReducedMotion = () => {
        this._reduceMotion = Boolean(this._reduceMotionQuery && this._reduceMotionQuery.matches);
      };
      if (this._reduceMotionQuery) {
        if (this._reduceMotionQuery.addEventListener) this._reduceMotionQuery.addEventListener('change', this._onReducedMotion);
        else if (this._reduceMotionQuery.addListener) this._reduceMotionQuery.addListener(this._onReducedMotion);
      }
      this._buildPrograms();
      this._buildFixedTargets();
      this._initMesh();
      this.currentArtwork = null;
      this.previousArtwork = null;
      this.incomingArtwork = null;
      this.pendingHold = false;
      this.blendRendered = false;
      this.blendDirty = true;
      this.currentIsPlaceholder = true;
      this.time = 0;
      this.lastFrameTime = 0;
      this.spectrum = new SpectrumPower();
      this.power = [0, 0, 0, 0];
      this.crossfadeProgress = 1;
      this.pinchProgress = 0;
      this.saturation = 0;
      this.blurRadius = 0;
      this.blurredSource = null;
      this.stateInitialised = false;
      this._running = false;
      this._raf = 0;
      this._resizeObserver = null;
      this._onWindowResize = () => this._resize(true);
      this._onVisibilityChange = () => {
        if (!document.hidden) this.lastFrameTime = performance.now();
      };
      if (typeof window !== 'undefined') window.addEventListener('resize', this._onWindowResize);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibilityChange);
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => this._resize(true));
        this._resizeObserver.observe(canvas);
      }
      this._resize(true);
      this._setPlaceholder();
      if (options.cover != null) this.setCover(options.cover, options.coverSeed);
      if (options.autoStart !== false) this.play();
    }

    _normalizeParameters() {
      const p = this.parameters;
      if (p.motion !== 'auto' && p.motion !== 'subdued' && p.motion !== 'exciting') p.motion = 'auto';
      p.speed = Number(p.speed);
      p.blurScale = Number(p.blurScale);
      p.saturationScale = Number(p.saturationScale);
      p.brightness = Number(p.brightness);
      p.blackScrim = Number(p.blackScrim);
      p.whiteScrim = Number(p.whiteScrim);
      p.audioReactivity = Number(p.audioReactivity);
      p.pinchStrength = clamp(Number(p.pinchStrength), 0, 1);
      p.renderScale = clamp(Number(p.renderScale), 0.1, 1);
      p.framesPerSecond = Math.max(10, Number(p.framesPerSecond) || 30);
      p.colorGrade = Boolean(p.colorGrade);
    }

    _buildPrograms() {
      const gl = this.gl;
      this.emptyVao = gl.createVertexArray();
      this.programs = {
        blend: createProgram(gl, FULLSCREEN_VS, BLEND_FS),
        rotate: createProgram(gl, ROTATE_VS, ROTATE_FS),
        blur: createProgram(gl, FULLSCREEN_VS, BLUR_FS),
        pinch: createProgram(gl, PINCH_VS, PINCH_FS)
      };
      this.uniforms = {
        blend: {
          previous: gl.getUniformLocation(this.programs.blend, 'uPrevious'),
          current: gl.getUniformLocation(this.programs.blend, 'uCurrent'),
          mix: gl.getUniformLocation(this.programs.blend, 'uMix')
        },
        rotate: {
          models: [0, 1, 2].map((i) => gl.getUniformLocation(this.programs.rotate, 'uModels[' + i + ']')),
          artwork: gl.getUniformLocation(this.programs.rotate, 'uArtwork'),
          blackScrim: gl.getUniformLocation(this.programs.rotate, 'uBlackScrim'),
          contrast: gl.getUniformLocation(this.programs.rotate, 'uContrast'),
          saturation: gl.getUniformLocation(this.programs.rotate, 'uSaturation'),
          instanceStep: gl.getUniformLocation(this.programs.rotate, 'uInstanceStep')
        },
        blur: {
          texture: gl.getUniformLocation(this.programs.blur, 'uTexture'),
          texel: gl.getUniformLocation(this.programs.blur, 'uTexel'),
          dir: gl.getUniformLocation(this.programs.blur, 'uDir'),
          sigma: gl.getUniformLocation(this.programs.blur, 'uSigma'),
          radius: gl.getUniformLocation(this.programs.blur, 'uRadius')
        },
        pinch: {
          blurred: gl.getUniformLocation(this.programs.pinch, 'uBlurred'),
          pinchMix: gl.getUniformLocation(this.programs.pinch, 'uPinchMix'),
          warpMix: gl.getUniformLocation(this.programs.pinch, 'uWarpMix'),
          whiteScrim: gl.getUniformLocation(this.programs.pinch, 'uWhiteScrim'),
          brightness: gl.getUniformLocation(this.programs.pinch, 'uBrightness'),
          grade: gl.getUniformLocation(this.programs.pinch, 'uGrade'),
          ditherStep: gl.getUniformLocation(this.programs.pinch, 'uDitherStep')
        }
      };
    }

    _buildFixedTargets() {
      const gl = this.gl;
      this.blend = createRenderTexture(gl, BLEND_SIZE, BLEND_SIZE);
      this.hold = createRenderTexture(gl, BLEND_SIZE, BLEND_SIZE);
      this.rotation = null;
      this.blurA = null;
      this.blurB = null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
    }

    _initMesh() {
      const gl = this.gl;
      this.meshVao = gl.createVertexArray();
      this.meshVbo = gl.createBuffer();
      this.meshIbo = gl.createBuffer();
      this.meshIndexCount = 0;
      gl.bindVertexArray(this.meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIbo);
      gl.bindVertexArray(null);
    }

    _initResize() {
    }

    _resize(force) {
      const dpr = typeof devicePixelRatio !== 'undefined' ? (devicePixelRatio || 1) : 1;
      const cssWidth = this.canvas.clientWidth || this.canvas.width || 1;
      const cssHeight = this.canvas.clientHeight || this.canvas.height || 1;
      const scale = clamp(this.parameters.renderScale, 0.1, 1) * dpr;
      const width = Math.max(1, Math.round(cssWidth * scale));
      const height = Math.max(1, Math.round(cssHeight * scale));
      if (!force && this.canvas.width === width && this.canvas.height === height) return;
      this.canvas.width = width;
      this.canvas.height = height;
      this._ensureIntermediates(width, height);
    }

    _ensureIntermediates(width, height) {
      const gl = this.gl;
      const w = Math.max(1, Math.floor(width / BLUR_DOWNSAMPLE));
      const h = Math.max(1, Math.floor(height / BLUR_DOWNSAMPLE));
      if (this.rotation && this.rotation.width === w && this.rotation.height === h) return;
      deleteRenderTexture(gl, this.rotation);
      deleteRenderTexture(gl, this.blurA);
      deleteRenderTexture(gl, this.blurB);
      this.rotation = createRenderTexture(gl, w, h, this.halfFloat);
      this.blurA = createRenderTexture(gl, w, h, this.halfFloat);
      this.blurB = createRenderTexture(gl, w, h, this.halfFloat);
    }

    _rebuildMesh(landscape) {
      const mesh = makePinchMesh(landscape, this.meshSeed, this.parameters.pinchStrength);
      const gl = this.gl;
      gl.bindVertexArray(this.meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIbo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
      this.meshIndexCount = mesh.indices.length;
      this.meshLandscape = landscape;
      this.meshDirty = false;
    }

    _createArtworkTexture(source) {
      const gl = this.gl;
      const drawable = toDrawable(source);
      const size = sourceSize(drawable);
      const side = Math.min(512, Math.max(size.w, size.h, 1));
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = side / Math.max(Math.min(size.w, size.h), 1);
      const drawWidth = size.w * scale;
      const drawHeight = size.h * scale;
      ctx.drawImage(drawable, (side - drawWidth) / 2, (side - drawHeight) / 2, drawWidth, drawHeight);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return texture;
    }

    _setPlaceholder() {
      this.currentIsPlaceholder = true;
      try {
        const texture = this._createArtworkTexture(makePaletteImage(this.palette));
        this._enqueue(texture);
      } catch (error) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1, 1);
        this._enqueue(this._createArtworkTexture(canvas));
      }
    }

    _enqueue(texture) {
      this.incomingArtwork = texture;
      this.pendingHold = true;
      this.blendDirty = true;
    }

    setCover(source, seed) {
      if (seed !== undefined && seed !== null) this.setSeed(seed);
      if (source === null || source === undefined) {
        this._setPlaceholder();
        return;
      }
      try {
        const texture = this._createArtworkTexture(source);
        this.currentIsPlaceholder = false;
        this._enqueue(texture);
      } catch (error) {
        this._setPlaceholder();
      }
    }

    setPalette(value) {
      this.palette = normalizePalette(value);
      if (this.currentIsPlaceholder) this._setPlaceholder();
    }

    setSeed(value) {
      const seed = seedFromString(value);
      if (seed !== this.meshSeed) {
        this.meshSeed = seed;
        this._seedName = String(value);
        this.meshDirty = true;
      }
    }

    setBehindLyrics(value) {
      this.isBehindLyrics = Boolean(value);
    }

    setParameters(values) {
      if (!values) return;
      const previous = this.parameters;
      this.parameters = Object.assign({}, previous, values);
      this._normalizeParameters();
      if (this.parameters.pinchStrength !== previous.pinchStrength) this.meshDirty = true;
      if (this.parameters.renderScale !== previous.renderScale) this._resize(true);
    }

    setEnergy(value) {
      if (!value) return;
      for (let i = 0; i < 4; i++) this.energy[i] = Number(value[i]) || 0;
    }

    play() {
      if (this._running) return;
      this._running = true;
      this.lastFrameTime = performance.now() - 1000 / this.parameters.framesPerSecond;
      const tick = (now) => {
        if (!this._running) return;
        this._raf = requestAnimationFrame(tick);
        if (typeof document !== 'undefined' && document.hidden) return;
        const interval = 1000 / Math.max(10, this.parameters.framesPerSecond);
        if (now - this.lastFrameTime < interval - 0.5) return;
        const dt = Math.min(0.1, Math.max(0, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;
        this._renderFrame(dt);
      };
      this._raf = requestAnimationFrame(tick);
    }

    pause() {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    }

    renderOnce(dt) {
      this._renderFrame(dt == null ? 1 / 60 : dt);
    }

    _resolvedIntensity() {
      if (this.parameters.motion === 'subdued') return false;
      if (this.parameters.motion === 'exciting') return true;
      return this.isBehindLyrics;
    }

    _advance(dt, landscape) {
      this.time += dt * (this._reduceMotion ? 0.1 : 1) * this.parameters.speed;
      const energy = this.energyProvider ? this.energyProvider() : this.energy;
      const reactivity = this.parameters.audioReactivity;
      const input = [
        (Number(energy[0]) || 0) * reactivity,
        (Number(energy[1]) || 0) * reactivity,
        (Number(energy[3]) || 0) * reactivity,
        (Number(energy[2]) || 0) * reactivity
      ];
      this.spectrum.update(input, dt);
      const exciting = this._resolvedIntensity();
      this.power = this.spectrum.power(exciting ? 1 : 0.2);
      const rate = dt / (transitionDuration / 2);
      this.crossfadeProgress = Math.min(1, this.crossfadeProgress + rate);
      const pinching = exciting && this.parameters.pinchStrength > 0;
      this.pinchProgress = pinching
        ? Math.min(1, this.pinchProgress + rate)
        : Math.max(0, this.pinchProgress - rate);
      const blurTarget = blurRadius(landscape, exciting) * this.parameters.blurScale;
      const saturationTarget = saturation(landscape, exciting) * this.parameters.saturationScale;
      if (!this.stateInitialised) {
        this.blurRadius = blurTarget;
        this.saturation = saturationTarget;
        this.stateInitialised = true;
      } else {
        const step = blurRadiusPointsPerSecond * dt * Math.max(0.25, this.parameters.blurScale);
        this.blurRadius += Math.min(step, Math.max(-step, blurTarget - this.blurRadius));
        this.saturation += (saturationTarget - this.saturation) * Math.min(1, rate);
      }
    }

    _drawBlendIfNeeded() {
      const gl = this.gl;
      if (this.pendingHold && this.incomingArtwork) {
        if (this.blendRendered) {
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.blend.framebuffer);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.hold.framebuffer);
          gl.blitFramebuffer(0, 0, BLEND_SIZE, BLEND_SIZE, 0, 0, BLEND_SIZE, BLEND_SIZE, gl.COLOR_BUFFER_BIT, gl.NEAREST);
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
          this.previousArtwork = this.hold.texture;
          this.crossfadeProgress = 0;
        } else {
          this.previousArtwork = null;
          this.crossfadeProgress = 1;
        }
        if (this.currentArtwork && this.currentArtwork !== this.hold.texture) {
          gl.deleteTexture(this.currentArtwork);
        }
        this.currentArtwork = this.incomingArtwork;
        this.incomingArtwork = null;
        this.pendingHold = false;
        this.blendDirty = true;
      }
      if (!this.currentArtwork) return false;
      if (this.blendDirty || this.crossfadeProgress < 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blend.framebuffer);
        gl.viewport(0, 0, BLEND_SIZE, BLEND_SIZE);
        gl.useProgram(this.programs.blend);
        gl.bindVertexArray(this.emptyVao);
        const u = this.uniforms.blend;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.previousArtwork || this.currentArtwork);
        gl.uniform1i(u.previous, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.currentArtwork);
        gl.uniform1i(u.current, 1);
        gl.uniform1f(u.mix, this.previousArtwork ? easeOut(this.crossfadeProgress) : 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        this.blendRendered = true;
        this.blendDirty = this.crossfadeProgress < 1;
      }
      return true;
    }

    _drawRotate(width, height) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rotation.framebuffer);
      gl.viewport(0, 0, this.rotation.width, this.rotation.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.programs.rotate);
      gl.bindVertexArray(this.emptyVao);
      const u = this.uniforms.rotate;
      const aspect = width / height;
      for (let i = 0; i < 3; i++) {
        gl.uniformMatrix4fv(u.models[i], false, instanceMatrix(i, this.time, aspect, this.power));
      }
      gl.uniform1f(u.blackScrim, this.parameters.blackScrim);
      gl.uniform1f(u.contrast, 1 + this.power[0] * 0.076);
      gl.uniform1f(u.saturation, this.saturation + this.power[2] * 0.166);
      gl.uniform1f(u.instanceStep, instanceScrimStep);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.blend.texture);
      gl.uniform1i(u.artwork, 0);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 3);
      gl.bindVertexArray(null);
    }

    _drawBlur(scale) {
      const gl = this.gl;
      const source = this.rotation;
      const sigmaKey = Math.round(this.blurRadius * scale / BLUR_DOWNSAMPLE * 2);
      if (sigmaKey < 1) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.blurB.framebuffer);
        gl.blitFramebuffer(
          0, 0, source.width, source.height,
          0, 0, this.blurB.width, this.blurB.height,
          gl.COLOR_BUFFER_BIT, gl.NEAREST
        );
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        this.blurredSource = this.blurB.texture;
        return;
      }
      const sigma = sigmaKey / 2;
      const radius = Math.min(MAX_BLUR_RADIUS, Math.max(1, Math.ceil(3 * sigma)));
      const u = this.uniforms.blur;
      gl.useProgram(this.programs.blur);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(u.texel, 1 / source.width, 1 / source.height);
      gl.uniform1f(u.sigma, sigma);
      gl.uniform1i(u.radius, radius);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.texture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.framebuffer);
      gl.viewport(0, 0, this.blurA.width, this.blurA.height);
      gl.uniform2f(u.dir, 1, 0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurB.framebuffer);
      gl.viewport(0, 0, this.blurB.width, this.blurB.height);
      gl.uniform2f(u.dir, 0, 1);
      gl.bindTexture(gl.TEXTURE_2D, this.blurA.texture);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      this.blurredSource = this.blurB.texture;
    }

    _drawPinch(width, height) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.programs.pinch);
      gl.bindVertexArray(this.meshVao);
      const u = this.uniforms.pinch;
      gl.uniform1f(u.pinchMix, easeInOut(this.pinchProgress));
      gl.uniform1f(u.warpMix, (Math.sin(this.time / warpPeriodDivisor) + 1) * 0.5);
      gl.uniform1f(u.whiteScrim, this.parameters.whiteScrim);
      gl.uniform1f(u.brightness, this.parameters.brightness);
      gl.uniform1f(u.grade, this.parameters.colorGrade ? 1 : 0);
      gl.uniform1f(u.ditherStep, 1 / 255);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.blurredSource);
      gl.uniform1i(u.blurred, 0);
      gl.drawElements(gl.TRIANGLES, this.meshIndexCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }

    _renderFrame(dt) {
      const gl = this.gl;
      this._resize(false);
      const width = this.canvas.width;
      const height = this.canvas.height;
      if (!this.rotation) return;
      const landscape = width > height;
      this._advance(dt, landscape);
      if (this.meshDirty || this.meshLandscape !== landscape) this._rebuildMesh(landscape);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      if (!this._drawBlendIfNeeded()) return;
      this._drawRotate(width, height);
      const cssWidth = this.canvas.clientWidth || width;
      this._drawBlur(width / cssWidth);
      this._drawPinch(width, height);
    }

    destroy() {
      this.pause();
      if (typeof window !== 'undefined') window.removeEventListener('resize', this._onWindowResize);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibilityChange);
      if (this._reduceMotionQuery) {
        if (this._reduceMotionQuery.removeEventListener) this._reduceMotionQuery.removeEventListener('change', this._onReducedMotion);
        else if (this._reduceMotionQuery.removeListener) this._reduceMotionQuery.removeListener(this._onReducedMotion);
      }
      if (this._resizeObserver) this._resizeObserver.disconnect();
      const gl = this.gl;
      if (this.currentArtwork) gl.deleteTexture(this.currentArtwork);
      if (this.incomingArtwork) gl.deleteTexture(this.incomingArtwork);
      deleteRenderTexture(gl, this.blend);
      deleteRenderTexture(gl, this.hold);
      deleteRenderTexture(gl, this.rotation);
      deleteRenderTexture(gl, this.blurA);
      deleteRenderTexture(gl, this.blurB);
      gl.deleteBuffer(this.meshVbo);
      gl.deleteBuffer(this.meshIbo);
      gl.deleteVertexArray(this.meshVao);
      gl.deleteVertexArray(this.emptyVao);
      Object.keys(this.programs).forEach((key) => gl.deleteProgram(this.programs[key]));
      this.currentArtwork = null;
      this.incomingArtwork = null;
      this.blend = null;
      this.hold = null;
      this.rotation = null;
      this.blurA = null;
      this.blurB = null;
    }
  }

export { MeshBackdrop };

/**
 * VideoMesh Module — v2: Two-Hand Support
 * Loads an MP4 video as a Three.js texture on a subdivided plane,
 * with vertex-shader displacement driven by up to TWO hand positions.
 *
 * Two-hand modes:
 *   4 = Stretch   (pull apart)
 *   5 = Squeeze   (push together)
 *   6 = Tear      (rip through)
 *   7 = Ripple Storm (dual wave interference)
 *   8 = Vortex    (dual spiral)
 *   9 = Fold      (paper fold)
 *  10 = Rotate    (spin surface)
 */
import * as THREE from 'three';

// ═══════════════════════════════════════════
//  VERTEX SHADER — supports single + dual hand
// ═══════════════════════════════════════════
const vertexShader = /* glsl */ `
  // ─── Single-hand uniforms ───
  uniform vec3 uHandPos;
  uniform float uHandActive;
  uniform float uBendStrength;
  uniform float uBendRadius;
  uniform int uBendMode;

  // ─── Two-hand uniforms ───
  uniform vec3 uHand2Pos;
  uniform float uHand2Active;
  uniform int uTwoHandMode;        // 0=off, 4=stretch, 5=squeeze, 6=tear, 7=ripple, 8=vortex, 9=fold, 10=rotate
  uniform float uTwoHandStrength;
  uniform float uHandDistance;      // distance between the two hands (normalized)
  uniform float uHandAngle;         // angle between hands
  uniform vec3 uMidpoint;           // midpoint between hands (scene coords)

  // ─── Shared ───
  uniform float uTime;
  uniform float uRipple;

  varying vec2 vUv;
  varying float vDisplacement;
  varying float vDistToHand;
  varying float vDistToHand2;
  varying float vTwoHandEffect;

  void main() {
    vUv = uv;

    vec3 pos = position;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);

    // Distances
    float dx1 = worldPos.x - uHandPos.x;
    float dy1 = worldPos.y - uHandPos.y;
    float dist1 = sqrt(dx1 * dx1 + dy1 * dy1);
    vDistToHand = dist1;

    float dx2 = worldPos.x - uHand2Pos.x;
    float dy2 = worldPos.y - uHand2Pos.y;
    float dist2 = sqrt(dx2 * dx2 + dy2 * dy2);
    vDistToHand2 = dist2;

    // Distance to midpoint
    float dxM = worldPos.x - uMidpoint.x;
    float dyM = worldPos.y - uMidpoint.y;
    float distM = sqrt(dxM * dxM + dyM * dyM);

    float displacement = 0.0;
    vTwoHandEffect = 0.0;

    // ═══════════════════════════════════
    //  TWO-HAND MODES (priority)
    // ═══════════════════════════════════
    if (uHand2Active > 0.5 && uTwoHandMode > 0) {
      float str = uTwoHandStrength;

      if (uTwoHandMode == 4) {
        // ── STRETCH ──
        // Pull vertices AWAY from the midpoint along the hand-to-hand axis
        float influence = 1.0 - smoothstep(0.0, uBendRadius * 1.5, distM);
        // Direction from midpoint to this vertex
        float stretchX = dxM * influence * str * 0.4;
        float stretchY = dyM * influence * str * 0.4;
        pos.x += stretchX;
        pos.y += stretchY;
        // Add depth bulge
        pos.z += influence * str * 1.5 * (1.0 - distM / (uBendRadius * 1.5));
        displacement = influence * str;
        vTwoHandEffect = influence;

      } else if (uTwoHandMode == 5) {
        // ── SQUEEZE ──
        // Push vertices TOWARD the midpoint
        float influence = 1.0 - smoothstep(0.0, uBendRadius * 1.5, distM);
        pos.x -= dxM * influence * str * 0.35;
        pos.y -= dyM * influence * str * 0.35;
        // Squish also compresses Z
        pos.z -= influence * str * 0.8;
        displacement = -influence * str;
        vTwoHandEffect = influence;

      } else if (uTwoHandMode == 6) {
        // ── TEAR ──
        // Create a crack/gap between the two hands
        // Axis direction from hand1 to hand2
        float axDx = uHand2Pos.x - uHandPos.x;
        float axDy = uHand2Pos.y - uHandPos.y;
        float axLen = sqrt(axDx * axDx + axDy * axDy) + 0.001;
        float nax = axDx / axLen;
        float nay = axDy / axLen;

        // Project vertex onto the axis
        float proj = dxM * nax + dyM * nay;
        // Perpendicular distance to axis
        float perpX = dxM - proj * nax;
        float perpY = dyM - proj * nay;
        float perpDist = sqrt(perpX * perpX + perpY * perpY);

        float tearWidth = 1.5 * str;
        float influence = 1.0 - smoothstep(0.0, tearWidth, perpDist);
        influence *= 1.0 - smoothstep(0.0, axLen * 0.7, abs(proj));

        // Push apart along perpendicular
        float side = sign(perpX * nay - perpY * nax);
        pos.x += side * nay * influence * str * 2.0;
        pos.y -= side * nax * influence * str * 2.0;
        // Depth crack
        pos.z -= influence * str * 3.0;
        displacement = -influence * str * 2.0;
        vTwoHandEffect = influence;

      } else if (uTwoHandMode == 7) {
        // ── RIPPLE STORM ──
        // Two wave sources creating interference
        float wave1 = sin(dist1 * 6.0 - uTime * 4.0) * (1.0 / (dist1 + 0.5));
        float wave2 = sin(dist2 * 6.0 - uTime * 4.0 + 1.57) * (1.0 / (dist2 + 0.5));
        float combined = (wave1 + wave2) * str * 0.8;
        pos.z += combined;
        displacement = combined;
        vTwoHandEffect = abs(combined);

      } else if (uTwoHandMode == 8) {
        // ── VORTEX ──
        // Two opposing spiral distortions around each hand
        float inf1 = 1.0 - smoothstep(0.0, uBendRadius, dist1);
        float angle1 = inf1 * str * 2.0;
        float cos1 = cos(angle1);
        float sin1 = sin(angle1);
        float rx1 = dx1 * cos1 - dy1 * sin1;
        float ry1 = dx1 * sin1 + dy1 * cos1;

        float inf2 = 1.0 - smoothstep(0.0, uBendRadius, dist2);
        float angle2 = -inf2 * str * 2.0;  // opposite direction
        float cos2 = cos(angle2);
        float sin2 = sin(angle2);
        float rx2 = dx2 * cos2 - dy2 * sin2;
        float ry2 = dx2 * sin2 + dy2 * cos2;

        // Blend based on proximity to each hand
        float w1 = inf1 / (inf1 + inf2 + 0.001);
        float w2 = inf2 / (inf1 + inf2 + 0.001);

        float totalInf = inf1 + inf2;
        pos.x = pos.x + (rx1 - dx1) * w1 + (rx2 - dx2) * w2;
        pos.y = pos.y + (ry1 - dy1) * w1 + (ry2 - dy2) * w2;
        pos.z += totalInf * str * 0.6;
        displacement = totalInf * str * 0.5;
        vTwoHandEffect = totalInf;

      } else if (uTwoHandMode == 9) {
        // ── FOLD ──
        // Fold the plane along the axis between hands
        float axDx = uHand2Pos.x - uHandPos.x;
        float axDy = uHand2Pos.y - uHandPos.y;
        float axLen = sqrt(axDx * axDx + axDy * axDy) + 0.001;
        float nax = axDx / axLen;
        float nay = axDy / axLen;

        // Signed distance from fold axis
        float signedDist = dxM * (-nay) + dyM * nax;
        float absDist = abs(signedDist);
        float foldRadius = uBendRadius * 1.2;
        float influence = 1.0 - smoothstep(0.0, foldRadius, absDist);

        // Fold: bring the far side up and rotate it
        float foldAngle = influence * str * 1.2 * sign(signedDist);
        pos.z += abs(sin(foldAngle)) * absDist * 0.6;
        // Also move inward
        pos.x -= signedDist * influence * str * 0.2 * (-nay);
        pos.y -= signedDist * influence * str * 0.2 * nax;
        displacement = influence * str;
        vTwoHandEffect = influence;

      } else if (uTwoHandMode == 10) {
        // ── ROTATE ──
        // Spin the video surface around the midpoint
        float influence = 1.0 - smoothstep(0.0, uBendRadius * 2.0, distM);
        float rotAngle = uHandAngle * influence * str;
        float cosR = cos(rotAngle);
        float sinR = sin(rotAngle);
        float newDx = dxM * cosR - dyM * sinR;
        float newDy = dxM * sinR + dyM * cosR;
        pos.x = uMidpoint.x + newDx;
        pos.y = uMidpoint.y + newDy;
        pos.z += influence * abs(str) * 0.3;
        displacement = influence * str * 0.3;
        vTwoHandEffect = influence;
      }

    }
    // ═══════════════════════════════════
    //  SINGLE-HAND MODES (fallback)
    // ═══════════════════════════════════
    else if (uHandActive > 0.5) {
      float influence = 1.0 - smoothstep(0.0, uBendRadius, dist1);

      if (uBendMode == 0) {
        // BEND
        displacement = influence * uBendStrength * 2.0;
        pos.z += displacement;
        pos.x += dx1 * influence * uBendStrength * 0.15;
        pos.y += dy1 * influence * uBendStrength * 0.15;
      } else if (uBendMode == 1) {
        // PINCH
        float pinchAmount = influence * uBendStrength * 0.5;
        pos.x -= dx1 * pinchAmount;
        pos.y -= dy1 * pinchAmount;
        pos.z += influence * uBendStrength * 1.5;
        displacement = influence * uBendStrength;
      } else if (uBendMode == 2) {
        // PUSH
        float pushAmount = influence * uBendStrength * 0.4;
        pos.x += dx1 * pushAmount;
        pos.y += dy1 * pushAmount;
        pos.z -= influence * uBendStrength * 1.0;
        displacement = -influence * uBendStrength;
      } else if (uBendMode == 3) {
        // TWIST
        float angle = influence * uBendStrength * 1.5;
        float cosA = cos(angle);
        float sinA = sin(angle);
        float rx = dx1 * cosA - dy1 * sinA;
        float ry = dx1 * sinA + dy1 * cosA;
        pos.x = uHandPos.x + rx;
        pos.y = uHandPos.y + ry;
        pos.z += influence * abs(uBendStrength) * 0.5;
        displacement = influence * uBendStrength * 0.5;
      }
    }

    // Ambient ripple
    if (uRipple > 0.01) {
      float rippleWave = sin(dist1 * 8.0 - uTime * 3.0) * uRipple * 0.15;
      pos.z += rippleWave;
      displacement += rippleWave;
    }

    vDisplacement = displacement;

    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
  }
`;

// ═══════════════════════════════════════════
//  FRAGMENT SHADER
// ═══════════════════════════════════════════
const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform float uHandActive;
  uniform float uHand2Active;
  uniform float uBendStrength;
  uniform float uTime;
  uniform vec3 uAccentColor;
  uniform vec3 uAccentColor2;
  uniform float uBrightness;
  uniform int uTwoHandMode;
  uniform float uTwoHandStrength;
  uniform float uGlitch;

  varying vec2 vUv;
  varying float vDisplacement;
  varying float vDistToHand;
  varying float vDistToHand2;
  varying float vTwoHandEffect;

  void main() {
    vec2 uv = vUv;

    // UV distortion near bending area
    if (uHandActive > 0.5 || uHand2Active > 0.5) {
      float distort = vDisplacement * 0.02;
      uv.x += sin(uv.y * 20.0 + uTime) * distort;
      uv.y += cos(uv.x * 20.0 + uTime) * distort;
    }

    uv = clamp(uv, 0.0, 1.0);

    vec4 videoColor = texture2D(uVideoTexture, uv);
    videoColor.rgb *= uBrightness;

    // ── Two-hand glow effect ──
    if (uHand2Active > 0.5 && uTwoHandMode > 0) {
      float twoGlow = vTwoHandEffect * 0.6;

      // Tear mode: dark crack in the center
      if (uTwoHandMode == 6) {
        float tearDarkness = vTwoHandEffect * uTwoHandStrength;
        videoColor.rgb *= 1.0 - tearDarkness * 0.7;
        // Red edge glow
        videoColor.rgb += vec3(1.0, 0.2, 0.1) * tearDarkness * 0.5;
      }
      // Ripple Storm: rainbow iridescence
      else if (uTwoHandMode == 7) {
        float hueShift = vTwoHandEffect * 3.0 + uTime * 0.5;
        vec3 rainbow = vec3(
          0.5 + 0.5 * sin(hueShift),
          0.5 + 0.5 * sin(hueShift + 2.094),
          0.5 + 0.5 * sin(hueShift + 4.189)
        );
        videoColor.rgb += rainbow * twoGlow * 0.3;
      }
      // Vortex: purple-cyan energy
      else if (uTwoHandMode == 8) {
        float e = vTwoHandEffect;
        vec3 energy = mix(uAccentColor, uAccentColor2, sin(uTime * 2.0 + e * 4.0) * 0.5 + 0.5);
        videoColor.rgb += energy * e * 0.4;
      }
      // Default two-hand glow
      else {
        vec3 dualGlow = mix(uAccentColor, uAccentColor2, 0.5) * twoGlow;
        videoColor.rgb += dualGlow;
      }
    }
    // ── Single-hand glow ──
    else {
      float glowIntensity = abs(vDisplacement) * 0.8;
      vec3 glow = uAccentColor * glowIntensity;
      videoColor.rgb += glow;

      if (uHandActive > 0.5 && vDistToHand < 3.0) {
        float edgeFactor = (1.0 - smoothstep(0.0, 3.0, vDistToHand)) * 0.15;
        videoColor.rgb += uAccentColor * edgeFactor;
      }
    }

    // Vignette
    float vignette = 1.0 - length(vUv - 0.5) * 0.18;
    videoColor.rgb *= vignette;

    // ── AI Gemini Response: Rainbow Glitch ──
    if (uGlitch > 0.0) {
      float g = uGlitch;
      float hue = uv.x * 6.283 + uv.y * 3.141 + uTime * 5.0;
      vec3 rainbow = vec3(
        0.5 + 0.5 * sin(hue),
        0.5 + 0.5 * sin(hue + 2.094),
        0.5 + 0.5 * sin(hue + 4.189)
      );
      vec2 aber = vec2(
        sin(uTime * 12.0 + uv.y * 30.0),
        cos(uTime * 9.0  + uv.x * 30.0)
      ) * 0.007 * g;
      float rr = texture2D(uVideoTexture, clamp(uv + aber, 0.0, 1.0)).r;
      float bb = texture2D(uVideoTexture, clamp(uv - aber, 0.0, 1.0)).b;
      videoColor.r = mix(videoColor.r, rr, g * 0.7);
      videoColor.b = mix(videoColor.b, bb, g * 0.7);
      videoColor.rgb += rainbow * g * 0.35;
    }

    gl_FragColor = videoColor;
  }
`;

// ═══════════════════════════════════════════
//  VIDEO MESH CLASS
// ═══════════════════════════════════════════
export class VideoMesh {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.videoElement = null;
    this.videoTexture = null;
    this.isPlaying = false;
    this.bendMode = 0;
    this.twoHandMode = 0;  // 0=auto (uses gesture detection), or manually set
    this.bendStrength = 1.0;
    this.rippleAmount = 0.0;
    this.brightness = 1.0;
    this.accentColor = new THREE.Color(0x7c5cff);
    this.accentColor2 = new THREE.Color(0x00e5a0);
    this._loadGeneration = 0;
    this._pendingLoadCleanup = null;
  }

  async loadVideo(fileOrUrl) {
    const sourceInput = typeof fileOrUrl === 'string' ? fileOrUrl.trim() : fileOrUrl;
    const isBlob = sourceInput instanceof File || sourceInput instanceof Blob
      || (typeof sourceInput === 'string' && sourceInput.startsWith('blob:'));

    if (typeof sourceInput === 'string' && !sourceInput) {
      throw new Error('No video source available for selected movie.');
    }

    if (typeof sourceInput !== 'string' && !isBlob) {
      throw new Error('Invalid video source supplied.');
    }

    if (this._pendingLoadCleanup) {
      this._pendingLoadCleanup();
      this._pendingLoadCleanup = null;
    }

    this.dispose();
    const loadGeneration = ++this._loadGeneration;

    const vid = document.createElement('video');
    // crossOrigin='anonymous' is required for Edge Mobile / mobile WebGL when
    // loading from the public R2 CDN, and remains safe for same-origin URLs.
    // Blob URLs are exempt because they do not make an HTTP request.
    if (!isBlob) vid.crossOrigin = 'anonymous';
    vid.loop = true;
    vid.muted = true;        // required for Chrome autoplay
    // Use setAttribute for playsinline — iOS/Edge mobile requires the HTML
    // attribute, not just the JS property, to allow inline inline playback
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', ''); // older iOS
    vid.setAttribute('muted', '');
    vid.playsInline = true;
    vid.preload = 'metadata';

    // Keep in viewport but invisible — Android/Edge will NOT buffer off-screen
    // elements (top:-9999px). Use opacity near-zero (NOT 0) + fixed within viewport:
    // Edge Mobile throttles frame delivery for elements with opacity===0, causing
    // the WebGL VideoTexture to never receive new frames (black screen).
    Object.assign(vid.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0.001',   // > 0 prevents Edge Mobile frame throttle
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.body.appendChild(vid);
    this.videoElement = vid;

    return new Promise((resolve, reject) => {
      let resolved = false;
      let timedOut = false;
      let timeoutId = null;
      let retriedViaBlob = false;
      let cancelPendingLoad = null;
      const REMOTE_LOAD_TIMEOUT_MS = 16000;
      const BLOB_LOAD_TIMEOUT_MS = 30000;

      const cleanup = () => {
        vid.removeEventListener('canplay', onReady);
        vid.removeEventListener('loadeddata', onReady);
        vid.removeEventListener('loadedmetadata', onReady);
        vid.removeEventListener('error', onError);
        if (timeoutId) clearTimeout(timeoutId);
        if (this._pendingLoadCleanup === cancelPendingLoad) {
          this._pendingLoadCleanup = null;
        }
      };

      cancelPendingLoad = () => {
        if (resolved || timedOut) return;
        timedOut = true;
        cleanup();
        const abortError = new Error('Video load superseded by a newer selection.');
        abortError.name = 'AbortError';
        reject(abortError);
      };
      this._pendingLoadCleanup = cancelPendingLoad;

      const armTimeout = (ms) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          if (resolved || loadGeneration !== this._loadGeneration) return;
          const recovered = await tryBlobFallback('timeout');
          if (recovered) return;
          timedOut = true;
          cleanup();
          reject(new Error('Video load timed out before metadata/canplay (remote source stalled and blob fallback did not recover).'));
        }, ms);
      };

      const onReady = () => {
        if (resolved || timedOut || loadGeneration !== this._loadGeneration) return;
        resolved = true;
        cleanup();
        if (!this.mesh) this._createMesh();
        vid.play().then(() => {
          this.isPlaying = true;
        }).catch(err => {
          console.warn('Autoplay retry blocked:', err);
          this.isPlaying = true;
        });
        resolve({
          width: vid.videoWidth || 1920,
          height: vid.videoHeight || 1080,
          duration: vid.duration,
        });
      };

      const applySource = (src) => {
        vid.src = src;
        vid.load();
        // Do NOT call play() here — calling play() before the browser has
        // buffered any data causes an 'interrupted' DOMException on Edge Mobile
        // that swallows the real error and prevents canplay/loadeddata from firing.
        // play() is called inside onReady once metadata is available.
        if (vid.readyState >= 2) {
          queueMicrotask(onReady);
        }
      };

      const tryBlobFallback = async (reason = 'error') => {
        const canTryBlobFallback = !retriedViaBlob
          && typeof sourceInput === 'string'
          && !sourceInput.startsWith('blob:')
          && loadGeneration === this._loadGeneration;

        if (!canTryBlobFallback) return false;

        retriedViaBlob = true;
        try {
          const response = await fetch(sourceInput, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          // Blob URLs don't support CORS — remove the attribute before reloading
          // or Edge Mobile will reject the blob URL with a CORS error.
          vid.removeAttribute('crossorigin');
          applySource(blobUrl);
          armTimeout(BLOB_LOAD_TIMEOUT_MS);
          return true;
        } catch (fallbackErr) {
          console.warn(`Blob fallback failed after ${reason}:`, fallbackErr);
          return false;
        }
      };

      const onError = async () => {
        if (resolved || timedOut || loadGeneration !== this._loadGeneration) return;
        const err = vid.error;

        const recovered = await tryBlobFallback('error');
        if (recovered) return;

        cleanup();
        reject(new Error(`Video load failed (code ${err?.code ?? 'n/a'}): ${err?.message || sourceInput}`));
      };

      vid.addEventListener('canplay', onReady);
      vid.addEventListener('loadeddata', onReady);
      vid.addEventListener('loadedmetadata', onReady);
      vid.addEventListener('error', onError);

      armTimeout(REMOTE_LOAD_TIMEOUT_MS);

      if (typeof sourceInput === 'string') {
        applySource(sourceInput);
      } else {
        applySource(URL.createObjectURL(sourceInput));
      }
    });
  }

  _createMesh() {
    const video = this.videoElement;
    const aspect = video.videoWidth / video.videoHeight;

    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;
    this.videoTexture.format = THREE.RGBAFormat;
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    const renderer = this.scene?.userData?.renderer || null;
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    this.videoTexture.anisotropy = Math.min(8, maxAnisotropy);

    // Compute the camera's visible viewport at the mesh plane (z=0, camera at z=14)
    // so the plane always fills the screen regardless of video aspect ratio.
    const CAM_DIST = 14;
    const CAM_FOV_DEG = 60;
    const fovRad = THREE.MathUtils.degToRad(CAM_FOV_DEG);
    const viewH = 2 * Math.tan(fovRad / 2) * CAM_DIST; // ≈16.2 world units
    const screenAspect = window.innerWidth / window.innerHeight;
    const viewW = viewH * screenAspect;

    // Use "cover" so the movie fills the viewport behind UI overlays,
    // accepting edge crop instead of side or bottom gutters.
    let planeWidth, planeHeight;
    if (aspect > screenAspect) {
      // Video is wider than screen → fill height, crop sides
      planeHeight = viewH;
      planeWidth = planeHeight * aspect;
    } else {
      // Video is taller than screen → fill width, crop top/bottom
      planeWidth = viewW;
      planeHeight = planeWidth / aspect;
    }
    // Ensure it fully covers (never smaller than viewport)
    if (planeWidth < viewW) { planeWidth = viewW; planeHeight = planeWidth / aspect; }
    if (planeHeight < viewH) { planeHeight = viewH; planeWidth = planeHeight * aspect; }

    const segmentsX = 128;
    const segmentsY = Math.round(segmentsX / aspect);

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, segmentsX, segmentsY);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uVideoTexture: { value: this.videoTexture },
        // Single hand
        uHandPos: { value: new THREE.Vector3(0, 0, 0) },
        uHandActive: { value: 0.0 },
        uBendStrength: { value: 0.0 },
        uBendRadius: { value: 4.0 },
        uBendMode: { value: 0 },
        // Two hands
        uHand2Pos: { value: new THREE.Vector3(0, 0, 0) },
        uHand2Active: { value: 0.0 },
        uTwoHandMode: { value: 0 },
        uTwoHandStrength: { value: 0.0 },
        uHandDistance: { value: 0.0 },
        uHandAngle: { value: 0.0 },
        uMidpoint: { value: new THREE.Vector3(0, 0, 0) },
        // Shared
        uTime: { value: 0.0 },
        uRipple: { value: 0.0 },
        uAccentColor: { value: this.accentColor.clone() },
        uAccentColor2: { value: this.accentColor2.clone() },
        uBrightness: { value: 1.0 },
        uGlitch: { value: 0.0 },
      },
      side: THREE.DoubleSide,
      transparent: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(0, 1, 0);
    this.scene.add(this.mesh);


  }

  // ─── SINGLE HAND UPDATE ───
  updateHand(handPosition, isActive, gesture, pinchStrength) {
    if (!this.material) return;
    const u = this.material.uniforms;

    u.uHandPos.value.copy(handPosition);
    u.uHandActive.value = isActive ? 1.0 : 0.0;

    let targetStrength = 0;
    let mode = 0;
    let accentColor = new THREE.Color(0x7c5cff);

    switch (gesture) {
      case 'open':
        mode = 0;
        targetStrength = 0.8;
        accentColor.setHex(0x7c5cff);
        break;
      case 'pinch':
        mode = 1;
        targetStrength = 1.2 + pinchStrength;
        accentColor.setHex(0xff6b9d);
        break;
      case 'fist':
        mode = 2;
        targetStrength = 1.5;
        accentColor.setHex(0xff5252);
        break;
      case 'palmUp':
        mode = 3;
        targetStrength = 1.0;
        accentColor.setHex(0x00e5a0);
        break;
      default:
        targetStrength = 0;
    }

    if (!isActive) targetStrength = 0;

    u.uBendStrength.value += (targetStrength - u.uBendStrength.value) * 0.08;
    u.uBendMode.value = mode;
    u.uRipple.value += (this.rippleAmount - u.uRipple.value) * 0.05;
    u.uBrightness.value += (this.brightness - u.uBrightness.value) * 0.05;
    u.uAccentColor.value.lerp(accentColor, 0.1);
  }

  // ─── TWO-HAND UPDATE ───
  updateTwoHands(twoHandData) {
    if (!this.material) return;
    const u = this.material.uniforms;

    if (!twoHandData) {
      // No second hand — disable two-hand mode
      u.uHand2Active.value += (0.0 - u.uHand2Active.value) * 0.1;
      u.uTwoHandStrength.value += (0.0 - u.uTwoHandStrength.value) * 0.08;
      if (u.uHand2Active.value < 0.05) {
        u.uTwoHandMode.value = 0;
      }
      return;
    }

    // Map second hand position
    const h2 = twoHandData.hand2;
    const targetX2 = (0.5 - h2.indexTip.x) * 24;
    const targetY2 = (0.5 - h2.indexTip.y) * 16;
    const targetZ2 = -h2.indexTip.z * 20;
    u.uHand2Pos.value.lerp(new THREE.Vector3(targetX2, targetY2, targetZ2), 0.24);
    u.uHand2Active.value += (1.0 - u.uHand2Active.value) * 0.15;

    // Map midpoint
    const midX = (0.5 - twoHandData.midpoint.x) * 24;
    const midY = (0.5 - twoHandData.midpoint.y) * 16;
    const midZ = -twoHandData.midpoint.z * 20;
    u.uMidpoint.value.lerp(new THREE.Vector3(midX, midY, midZ), 0.15);

    // Hand distance and angle
    u.uHandDistance.value += (twoHandData.handDistance - u.uHandDistance.value) * 0.1;
    u.uHandAngle.value += (twoHandData.angle - u.uHandAngle.value) * 0.1;

    // Map gesture to two-hand mode
    const gestureToMode = {
      'stretch': 4,
      'squeeze': 5,
      'tear': 6,
      'rippleStorm': 7,
      'vortex': 8,
      'fold': 9,
      'rotate': 10,
      'dualIdle': 4, // default to stretch when both hands are idle but present
    };

    const mode = gestureToMode[twoHandData.twoHandGesture] || 4;
    u.uTwoHandMode.value = mode;

    // Two-hand strength
    const targetStr = twoHandData.gestureStrength;
    u.uTwoHandStrength.value += (targetStr - u.uTwoHandStrength.value) * 0.08;

    // Two-hand accent colors
    const accentColors = {
      4: [0x00e5a0, 0x7c5cff],   // Stretch: green-purple
      5: [0xffb347, 0xff6b9d],   // Squeeze: orange-pink
      6: [0xff5252, 0xff1744],   // Tear: red
      7: [0x00d4ff, 0xe040fb],   // Ripple: cyan-magenta
      8: [0x7c5cff, 0x00e5a0],   // Vortex: purple-green
      9: [0xffb347, 0x7c5cff],   // Fold: warm-purple
      10: [0x00d4ff, 0x00e5a0],  // Rotate: cyan-green
    };

    const [c1, c2] = accentColors[mode] || [0x7c5cff, 0x00e5a0];
    u.uAccentColor.value.lerp(new THREE.Color(c1), 0.08);
    u.uAccentColor2.value.lerp(new THREE.Color(c2), 0.08);
  }

  // ─── PER-FRAME UPDATE ───
  update(time) {
    if (!this.material) return;
    this.material.uniforms.uTime.value = time;
    // Always mark needsUpdate — Edge Mobile requires this even when paused
    // (the browser may deliver a late frame after play() resolves).
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }
  }

  // ── AI Response: Rainbow Glitch Pulse ──
  triggerRainbowGlitch(duration = 2500) {
    if (!this.material) return;
    const u = this.material.uniforms;
    u.uGlitch.value = 1.0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1.0);
      // ease-out cubic
      u.uGlitch.value = 1.0 - t * t * t;
      if (t < 1.0) requestAnimationFrame(tick);
      else u.uGlitch.value = 0.0;
    };
    requestAnimationFrame(tick);
  }

  setBendMode(mode) {
    this.bendMode = mode;
    if (this.material) this.material.uniforms.uBendMode.value = mode;
  }

  setBendRadius(radius) {
    if (this.material) this.material.uniforms.uBendRadius.value = radius;
  }

  togglePlayback() {
    if (!this.videoElement) return;
    if (this.isPlaying) {
      this.videoElement.pause();
    } else {
      this.videoElement.play();
    }
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }

  toggleMute() {
    if (!this.videoElement) return;
    this.videoElement.muted = !this.videoElement.muted;
    return this.videoElement.muted;
  }

  seek(fraction) {
    if (!this.videoElement) return;
    this.videoElement.currentTime = fraction * this.videoElement.duration;
  }

  getProgress() {
    if (!this.videoElement || !this.videoElement.duration) return 0;
    return this.videoElement.currentTime / this.videoElement.duration;
  }

  dispose() {
    if (this._pendingLoadCleanup) {
      this._pendingLoadCleanup();
      this._pendingLoadCleanup = null;
    }
    this._loadGeneration += 1;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.frame) {
      this.scene.remove(this.frame);
      this.frame.geometry.dispose();
      this.frame = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }
    if (this.videoElement) {
      this.videoElement.pause();
      if (this.videoElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.videoElement.src);
      }
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
    this.isPlaying = false;
  }
}

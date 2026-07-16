const THREE = window.THREE;

function setStatus(value) {
  window.__NOCTURNE_STATUS = value;
  if (document.body) document.body.dataset.nocturneStatus = value;
}

function setError(value) {
  window.__NOCTURNE_ERROR = value;
  if (document.body) document.body.dataset.nocturneError = value;
}

setStatus("script-start");
window.addEventListener("error", (event) => {
  setError(`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
});
window.addEventListener("unhandledrejection", (event) => {
  setError(event.reason?.stack || event.reason?.message || String(event.reason));
});

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});

renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.011);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 260);
let zoomDepth = 0;
const cameraStartZ = 18;
camera.position.set(0, 0, cameraStartZ);

const clock = new THREE.Clock();
const tmpColor = new THREE.Color();
const blackColor = new THREE.Color(0x020203);
const radialTexture = createRadialTexture();

const state = {
  spiral: 0,
  zigzag: 0,
  linear: 0,
  magnetic: 0,
  randomize: 0,
  pixelate: 0,
  mirror: 0,
  distort: 0,
  edgeWobble: 0,
  kaleido: 0,
  pulse: 0,
  trail: 0,
  glowBloom: 0,
  outlineWeight: 0,
  depthHaze: 0,
  volume: 0.56,
};

let mutationPulse = 0;
let randomMutation = 0;
let spawnAccumulator = 0;
let starSerial = 0;

const palettes = [
  { color: 0x1d49ff, glow: 0x3c6dff, label: "cobalt" },
  { color: 0xff6b56, glow: 0xff7b61, label: "coral" },
  { color: 0xffc36d, glow: 0xffd074, label: "sun" },
  { color: 0xf2b6ff, glow: 0xf36cff, label: "orchid" },
  { color: 0x429b87, glow: 0x50e3c0, label: "teal" },
  { color: 0x082b4a, glow: 0x2ba8ff, label: "ink" },
];

const shapeKinds = [
  "scallop",
  "softBloom",
  "sunBurst",
  "spikeBurst",
  "hollowStar",
  "hollowBloom",
  "sevenStar",
  "sparkle",
  "flower",
  "pinwheel",
  "splash",
  "asterisk",
];

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const backLight = new THREE.DirectionalLight(0x7cf7ff, 1.2);
backLight.position.set(0, 1.6, -8);
scene.add(backLight);

const backGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: radialTexture,
    color: 0x1b62ff,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
backGlow.scale.set(22, 16, 1);
scene.add(backGlow);

const particleField = createParticleField(1450, 55, 0.046, 0xdffbff, 0xff68d8);
scene.add(particleField);

const dustField = createParticleField(720, 36, 0.07, 0xffc36d, 0x1d49ff);
dustField.material.opacity = 0.18;
scene.add(dustField);

const postTarget = new THREE.WebGLRenderTarget(1, 1, {
  depthBuffer: true,
  stencilBuffer: false,
});
postTarget.texture.encoding = THREE.sRGBEncoding;

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postUniforms = {
  tDiffuse: { value: postTarget.texture },
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uPixelate: { value: 0 },
  uMirrorSides: { value: 0 },
  uDistort: { value: 0 },
  uMutation: { value: 0 },
};

const postMaterial = new THREE.ShaderMaterial({
  uniforms: postUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uPixelate;
    uniform float uMirrorSides;
    uniform float uDistort;
    uniform float uMutation;
    varying vec2 vUv;

    const float PI = 3.14159265359;
    const float TAU = 6.28318530718;

    vec2 kaleidoUv(vec2 uv, float sides) {
      if (sides < 1.5) {
        return uv;
      }

      vec2 centered = uv - 0.5;
      float radius = length(centered);
      float angle = atan(centered.y, centered.x);
      float sector = TAU / sides;
      angle = mod(angle + sector * 0.5, sector) - sector * 0.5;
      angle = abs(angle);
      return vec2(cos(angle), sin(angle)) * radius + 0.5;
    }

    void main() {
      vec2 uv = kaleidoUv(vUv, uMirrorSides);

      vec2 wave = vec2(
        sin(uv.y * 22.0 + uTime * 2.6) + sin(uv.y * 49.0 - uTime * 1.4),
        cos(uv.x * 31.0 - uTime * 2.0)
      );
      uv += wave * uDistort * 0.02;

      float cells = mix(uResolution.x, 38.0, smoothstep(0.0, 1.0, uPixelate));
      vec2 grid = vec2(cells, cells * uResolution.y / max(1.0, uResolution.x));
      vec2 blockUv = (floor(uv * grid) + 0.5) / grid;
      uv = mix(uv, blockUv, uPixelate);

      vec4 color = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
      if (uMirrorSides > 1.5) {
        vec2 centered = vUv - 0.5;
        float angle = atan(centered.y, centered.x);
        float sector = TAU / uMirrorSides;
        float seam = abs(mod(angle + sector * 0.5, sector) - sector * 0.5);
        float seamGlow = 1.0 - smoothstep(0.0, 0.012 + 0.002 * uMirrorSides, seam);
        color.rgb += vec3(0.12, 0.18, 0.2) * seamGlow;
      }
      float chroma = uDistort * 0.011 + uMutation * 0.006 + step(1.5, uMirrorSides) * 0.0025;
      if (chroma > 0.001) {
        color.r = texture2D(tDiffuse, clamp(uv + vec2(chroma, 0.0), 0.0, 1.0)).r;
        color.b = texture2D(tDiffuse, clamp(uv - vec2(chroma, 0.0), 0.0, 1.0)).b;
      }

      float vignette = smoothstep(0.96, 0.2, distance(vUv, vec2(0.5)));
      float scan = 0.965 + 0.035 * sin((vUv.y + uTime * 0.18) * 860.0);
      color.rgb *= mix(0.52, 1.12, vignette) * scan;
      color.rgb += vec3(0.02, 0.012, 0.035) * uMutation;
      gl_FragColor = color;
    }
  `,
  depthWrite: false,
  depthTest: false,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

const stars = [];
resize();
window.addEventListener("resize", resize);
setupControls();

function setupControls() {
  document.querySelectorAll("[data-control]").forEach((input) => {
    const key = input.dataset.control;
    const output = document.querySelector(`#${input.id}Out`);
    if (output) setOutputValue(output, key, Number(input.value) / 100, input.value);
    state[key] = key === "volume" ? Number(input.value) / 100 : Number(input.value) / 100;

    input.addEventListener("input", () => {
      const value = Number(input.value) / 100;
      state[key] = value;
      if (output) setOutputValue(output, key, value, input.value);
      if (key === "volume") {
        audioEngine.setVolume(value);
      }
      markMutation(key, value);
    });
  });

  const audioToggle = document.querySelector("#audioToggle");
  audioToggle.addEventListener("click", async () => {
    const playing = await audioEngine.toggle();
    audioToggle.classList.toggle("is-playing", playing);
    audioToggle.setAttribute("aria-label", playing ? "Pause music" : "Start music");
    markMutation("audio", state.volume);
  });
}

function setOutputValue(output, key, value, rawValue) {
  const label = key === "mirror" ? mirrorLabelFromValue(value) : rawValue;
  output.value = label;
  output.textContent = label;
}

function mirrorSidesFromValue(value) {
  if (value <= 0.01) return 0;
  if (value <= 0.25) return 2;
  if (value <= 0.5) return 4;
  if (value <= 0.75) return 8;
  return 16;
}

function mirrorLabelFromValue(value) {
  const sides = mirrorSidesFromValue(value);
  return sides === 0 ? "Off" : String(sides);
}

function markMutation(key, value) {
  mutationPulse = 1;
  randomMutation += key === "randomize" ? 2.5 + value : 0.2 + value * 0.42;
  document.querySelector("#mutationMeter").style.transform = `scaleX(${0.24 + value * 0.76})`;
  if (key !== "volume") {
    spawnAccentBurst(2 + Math.round(value * 4));
  }
  audioEngine.mutate(key, value, aggregateEnergy());
}

function aggregateEnergy() {
  const motion = (state.spiral + state.zigzag + state.linear + state.magnetic + state.randomize) / 5;
  const pattern = (state.kaleido + state.pulse + state.trail) / 3;
  const filter = (state.pixelate + state.mirror + state.distort + state.edgeWobble) / 4;
  const visual = (state.glowBloom + state.outlineWeight + state.depthHaze) / 3;
  return THREE.MathUtils.clamp(motion * 0.3 + pattern * 0.28 + filter * 0.2 + visual * 0.22, 0, 1);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();
  const energy = aggregateEnergy();

  mutationPulse = Math.max(0, mutationPulse - dt * 1.9);
  const zoomSpeed = 5.6 + state.linear * 5.8 + state.randomize * 4.5 + energy * 4.4;
  zoomDepth += dt * zoomSpeed;
  camera.position.z = cameraStartZ - zoomDepth;
  camera.position.x = Math.sin(time * 0.19 + randomMutation * 0.07) * (0.12 + state.magnetic * 0.24);
  camera.position.y = Math.cos(time * 0.16 + state.spiral * 0.8) * (0.08 + state.spiral * 0.2);
  camera.lookAt(camera.position.x, camera.position.y, camera.position.z - 28);
  document.body.dataset.zoomDepth = String(Math.round(zoomDepth));

  updateVisualEffects(time, energy);
  updateParticleFields(time, energy);
  maybeSpawnMore(dt, energy);
  stars.forEach((star) => star.update(time, dt, energy));

  postUniforms.uTime.value = time;
  postUniforms.uPixelate.value = state.pixelate;
  postUniforms.uMirrorSides.value = mirrorSidesFromValue(state.mirror);
  postUniforms.uDistort.value = state.distort;
  postUniforms.uMutation.value = mutationPulse;

  renderer.setRenderTarget(postTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);

  requestAnimationFrame(animate);
}

function updateVisualEffects(time, energy) {
  scene.fog.density = 0.008 + state.depthHaze * 0.035;
  ambientLight.intensity = 0.32 + state.glowBloom * 0.22 + energy * 0.08;
  backLight.intensity = 0.7 + state.glowBloom * 2.8 + state.outlineWeight * 1.2 + mutationPulse * 0.9;
  renderer.toneMappingExposure = 1.02 + state.glowBloom * 0.24 - state.depthHaze * 0.16;
  backGlow.position.set(camera.position.x, camera.position.y, camera.position.z - 46);
  backGlow.material.opacity = 0.1 + state.pulse * 0.14 + state.glowBloom * 0.42 + mutationPulse * 0.12;
  backGlow.scale.set(22 + state.glowBloom * 18, 16 + state.glowBloom * 13, 1);
  backGlow.material.color.setHSL(0.58 + Math.sin(time * 0.08) * 0.06 + state.kaleido * 0.1, 1, 0.55);
}

function updateParticleFields(time, energy) {
  particleField.position.set(camera.position.x, camera.position.y, camera.position.z - 52);
  particleField.rotation.y = time * (0.01 + state.randomize * 0.04);
  particleField.rotation.z = Math.sin(time * 0.06) * 0.12;
  particleField.material.size = 0.042 + energy * 0.03 + mutationPulse * 0.02;
  particleField.material.opacity = 0.28 + state.glowBloom * 0.28 + state.pulse * 0.12 - state.depthHaze * 0.08;

  dustField.position.set(camera.position.x, camera.position.y, camera.position.z - 34);
  dustField.rotation.x = Math.sin(time * 0.08) * 0.18;
  dustField.rotation.z = -time * (0.012 + state.spiral * 0.05);
  dustField.material.opacity = 0.12 + energy * 0.1 + state.depthHaze * 0.22 + mutationPulse * 0.18;
}

function seedInitialStars() {
  for (let i = 0; i < 34; i += 1) {
    addStar(i < 14 ? 8 + Math.random() * 50 : 18 + Math.random() * 90, i < 14);
  }
}

function maybeSpawnMore(dt, energy) {
  spawnAccumulator += dt * (0.75 + energy * 2.2 + state.randomize * 1.4);
  while (spawnAccumulator > 1 && stars.length < 72) {
    spawnAccumulator -= 1;
    addStar(34 + Math.random() * 95, false);
  }
}

function spawnAccentBurst(count) {
  for (let i = 0; i < count; i += 1) {
    if (stars.length < 72) {
      addStar(10 + Math.random() * 42, true);
    } else {
      const star = stars[(starSerial + i) % stars.length];
      star.spawn(10 + Math.random() * 48, true);
      star.popBoost = 1;
    }
  }
}

function addStar(depth, focus) {
  const star = new PatternStar(starSerial, depth, focus);
  stars.push(star);
  starSerial += 1;
  return star;
}

class PatternStar {
  constructor(index, depth, focus) {
    this.index = index;
    this.seed = index * 7.31 + Math.random() * 100;
    this.kind = shapeKinds[index % shapeKinds.length];
    this.palette = palettes[index % palettes.length];
    this.group = new THREE.Group();
    this.basePosition = new THREE.Vector2();
    this.motionDirection = new THREE.Vector2(rand(this.seed, 1) * 2 - 1, rand(this.seed, 2) * 2 - 1).normalize();
    this.baseRotation = rand(this.seed, 3) * Math.PI * 2;
    this.spin = (rand(this.seed, 4) - 0.5) * 0.52;
    this.baseScale = 1;
    this.popBoost = 1;
    this.shapeData = makeShapeData(this.kind, this.seed);
    this.geometry = new THREE.ShapeGeometry(this.shapeData.shape, 12);
    this.geometry.computeBoundingSphere();
    this.baseGeometryPositions = Float32Array.from(this.geometry.attributes.position.array);

    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: this.palette.color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: this.palette.glow,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.trailMaterial = new THREE.MeshBasicMaterial({
      color: this.palette.glow,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.core = new THREE.Mesh(this.geometry, this.coreMaterial);
    this.core.renderOrder = 2;
    this.group.add(this.core);

    this.glow = new THREE.Mesh(this.geometry, this.glowMaterial);
    this.glow.scale.setScalar(1.26);
    this.glow.renderOrder = 1;
    this.group.add(this.glow);

    this.outline = createOutline(this.shapeData.points, this.palette.glow);
    this.baseOutlinePositions = Float32Array.from(this.outline.geometry.attributes.position.array);
    this.outline.renderOrder = 3;
    this.group.add(this.outline);

    this.rings = Array.from({ length: 3 }, (_, ringIndex) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.92 + ringIndex * 0.16, 0.94 + ringIndex * 0.16, 96),
        new THREE.MeshBasicMaterial({
          color: this.palette.glow,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.renderOrder = 0;
      this.group.add(ring);
      return ring;
    });

    this.satellites = Array.from({ length: 6 }, (_, satelliteIndex) => {
      const material = this.coreMaterial.clone();
      material.opacity = 0;
      material.blending = THREE.AdditiveBlending;
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.scale.setScalar(0.38 + satelliteIndex * 0.018);
      mesh.renderOrder = 2;
      this.group.add(mesh);
      return mesh;
    });

    this.trails = Array.from({ length: 4 }, (_, trailIndex) => {
      const material = this.trailMaterial.clone();
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.scale.setScalar(1 + trailIndex * 0.08);
      mesh.renderOrder = 0;
      this.group.add(mesh);
      return mesh;
    });

    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture,
        color: this.palette.glow,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.sprite.scale.set(3.4, 3.4, 1);
    this.sprite.renderOrder = 0;
    this.group.add(this.sprite);

    scene.add(this.group);
    this.spawn(depth, focus);
  }

  spawn(depth, focus) {
    const targetDepth = depth ?? 70 + Math.random() * 110;
    const bounds = visibleBoundsAtDepth(targetDepth);
    const edgeBias = focus ? 0.42 : 0.58;
    this.basePosition.set((Math.random() * 2 - 1) * bounds.width * edgeBias, (Math.random() * 2 - 1) * bounds.height * edgeBias);
    this.group.position.set(this.basePosition.x, this.basePosition.y, camera.position.z - targetDepth);
    this.baseScale = (focus ? 1.35 : 0.9) + Math.random() * (focus ? 1.55 : 1.25);
    this.baseRotation = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * (0.4 + state.kaleido * 1.2 + state.spiral * 0.8);
    this.kind = shapeKinds[(this.index + Math.floor(randomMutation * 3) + Math.floor(Math.random() * shapeKinds.length)) % shapeKinds.length];
    this.palette = palettes[(this.index + Math.floor(randomMutation * 5) + Math.floor(Math.random() * palettes.length)) % palettes.length];
    this.setPalette();
    this.popBoost = 1;
  }

  setPalette() {
    this.coreMaterial.color.setHex(this.palette.color);
    this.glowMaterial.color.setHex(this.palette.glow);
    this.outline.material.color.setHex(this.palette.glow);
    this.sprite.material.color.setHex(this.palette.glow);
    this.rings.forEach((ring) => ring.material.color.setHex(this.palette.glow));
    this.satellites.forEach((satellite, i) => {
      const color = palettes[(i + this.index) % palettes.length].color;
      satellite.material.color.setHex(color);
    });
    this.trails.forEach((trail) => trail.material.color.setHex(this.palette.glow));
  }

  update(time, dt, energy) {
    const depth = camera.position.z - this.group.position.z;
    if (depth < -5) {
      this.spawn(34 + Math.random() * 120, false);
      return;
    }

    const farFade = 1 - smoothstepRange(125, 170, depth);
    const nearFade = smoothstepRange(1.5, 9, depth);
    const alpha = THREE.MathUtils.clamp(farFade * nearFade, 0, 1);
    const phase = time + this.seed + randomMutation * 0.07;
    const motion = Math.max(state.spiral, state.zigzag, state.linear, state.magnetic, state.randomize);

    let x = this.basePosition.x;
    let y = this.basePosition.y;
    if (state.spiral > 0) {
      const angle = time * (0.65 + state.spiral * 1.25) + this.seed + depth * 0.045;
      const radius = (0.65 + Math.sin(depth * 0.06 + this.seed) * 0.35) * state.spiral;
      x += Math.cos(angle) * radius * 2.1;
      y += Math.sin(angle) * radius * 1.55;
    }
    if (state.zigzag > 0) {
      const step = Math.sign(Math.sin(time * 4.2 + this.seed)) || 1;
      x += step * state.zigzag * 1.0;
      y += triangleWave(time * 0.9 + this.seed) * state.zigzag * 0.9;
    }
    if (state.linear > 0) {
      x += this.motionDirection.x * Math.sin(time * 0.8 + this.seed) * state.linear * 1.55;
      y += this.motionDirection.y * Math.sin(time * 0.8 + this.seed) * state.linear * 1.55;
    }
    if (state.magnetic > 0) {
      const pull = Math.sin(time * 0.7 + this.seed) * 0.5 + 0.5;
      const strength = state.magnetic * (0.18 + pull * 0.52);
      x *= 1 - strength;
      y *= 1 - strength;
      x += Math.sin(this.seed + time * 1.1) * state.magnetic * 0.45;
      y += Math.cos(this.seed * 0.7 + time * 0.95) * state.magnetic * 0.45;
    }
    if (state.randomize > 0) {
      x += Math.sin(time * (1.2 + rand(this.seed, 9)) + randomMutation) * state.randomize * 1.2;
      y += Math.cos(time * (1.0 + rand(this.seed, 10)) + this.seed) * state.randomize * 1.0;
    }

    this.group.position.x = x;
    this.group.position.y = y;
    this.group.rotation.z = this.baseRotation + time * (this.spin + state.spiral * 1.25 + state.kaleido * 1.2);

    this.popBoost = Math.max(0, this.popBoost - dt * 1.8);
    const pulseScale = 1 + Math.sin(time * (2.2 + state.pulse * 4) + this.seed) * state.pulse * 0.13;
    const depthScale = THREE.MathUtils.lerp(0.72, 1.25, smoothstepRange(80, 10, depth));
    const scale = this.baseScale * depthScale * pulseScale * (1 + this.popBoost * 0.28 + mutationPulse * 0.06);
    this.group.scale.setScalar(scale);

    this.updateEdgeWobble(time);

    const hazeFade = THREE.MathUtils.lerp(1, THREE.MathUtils.clamp(1 - depth / 155, 0.1, 1), state.depthHaze);
    const outlineBoost = state.outlineWeight;
    const bloom = state.glowBloom;
    const darken = state.depthHaze * 0.18;
    tmpColor.setHex(this.palette.color).lerp(blackColor, darken);
    this.coreMaterial.color.copy(tmpColor);
    this.coreMaterial.opacity = alpha * hazeFade * (0.82 + bloom * 0.08);

    this.glowMaterial.opacity = alpha * hazeFade * (0.12 + bloom * 0.74 + state.pulse * 0.18 + mutationPulse * 0.18);
    this.glow.scale.setScalar(1.16 + bloom * 0.72 + state.pulse * 0.22 + mutationPulse * 0.12);
    this.sprite.material.opacity = alpha * hazeFade * (0.08 + bloom * 0.65 + mutationPulse * 0.16);
    this.sprite.scale.setScalar(2.6 + bloom * 5.4 + state.pulse * 1.2);

    this.outline.material.opacity = alpha * (0.24 + outlineBoost * 0.95 + bloom * 0.18);
    this.outline.scale.setScalar(1.01 + outlineBoost * 0.11 + bloom * 0.03);

    this.updateKaleido(time, alpha);
    this.updatePulseRings(time, alpha);
    this.updateTrails(time, alpha, motion);
  }

  updateKaleido(time, alpha) {
    const amount = state.kaleido;
    this.satellites.forEach((satellite, i) => {
      const visible = amount > 0.02 && alpha > 0.02;
      satellite.visible = visible;
      if (!visible) return;
      const angle = (i / this.satellites.length) * Math.PI * 2 + time * (0.35 + amount * 1.3) + this.seed;
      const radius = 0.72 + amount * 1.6 + Math.sin(time * 1.2 + i) * 0.14 * amount;
      satellite.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -0.015 * i);
      satellite.rotation.z = -this.group.rotation.z + angle * 0.35;
      satellite.scale.setScalar(0.34 + amount * 0.2 + (i % 2) * 0.04);
      satellite.material.opacity = alpha * amount * (0.24 + 0.16 * Math.sin(time * 2 + i) + mutationPulse * 0.14);
    });
  }

  updateEdgeWobble(time) {
    const amount = state.edgeWobble;
    const geometryPositions = this.geometry.attributes.position.array;
    for (let i = 0; i < geometryPositions.length; i += 3) {
      const x = this.baseGeometryPositions[i];
      const y = this.baseGeometryPositions[i + 1];
      const angle = Math.atan2(y, x);
      const wave = Math.sin(angle * 7 + time * 3.2 + this.seed) * 0.07 + Math.sin(angle * 13 - time * 2.1 + this.seed * 0.3) * 0.04;
      const scale = 1 + amount * wave;
      geometryPositions[i] = x * scale;
      geometryPositions[i + 1] = y * scale;
    }
    this.geometry.attributes.position.needsUpdate = true;

    const outlinePositions = this.outline.geometry.attributes.position.array;
    for (let i = 0; i < outlinePositions.length; i += 3) {
      const x = this.baseOutlinePositions[i];
      const y = this.baseOutlinePositions[i + 1];
      const angle = Math.atan2(y, x);
      const wave = Math.sin(angle * 7 + time * 3.2 + this.seed) * 0.075 + Math.sin(angle * 13 - time * 2.1 + this.seed * 0.3) * 0.045;
      const scale = 1 + amount * wave;
      outlinePositions[i] = x * scale;
      outlinePositions[i + 1] = y * scale;
    }
    this.outline.geometry.attributes.position.needsUpdate = true;
  }

  updatePulseRings(time, alpha) {
    const amount = state.pulse;
    this.rings.forEach((ring, i) => {
      const visible = amount > 0.02 && alpha > 0.02;
      ring.visible = visible;
      if (!visible) return;
      const phase = fract(time * (0.42 + amount * 0.9) + i * 0.24 + this.seed);
      ring.scale.setScalar(1.05 + phase * (1.9 + amount * 1.8));
      ring.rotation.z = -this.group.rotation.z;
      ring.material.opacity = alpha * amount * (1 - phase) * (0.24 + state.glowBloom * 0.26 + state.outlineWeight * 0.12);
    });
  }

  updateTrails(time, alpha, motion) {
    const amount = state.trail;
    const trailStrength = amount * (0.45 + motion * 0.55);
    const heading = this.group.rotation.z + Math.PI * 0.72;
    this.trails.forEach((trail, i) => {
      const visible = trailStrength > 0.02 && alpha > 0.02;
      trail.visible = visible;
      if (!visible) return;
      const step = i + 1;
      trail.position.set(-Math.cos(heading) * step * trailStrength * 0.16, -Math.sin(heading) * step * trailStrength * 0.16, step * 0.006);
      trail.rotation.z = -step * 0.035 * amount;
      trail.scale.setScalar(1 + step * 0.08 + amount * 0.22);
      trail.material.opacity = alpha * trailStrength * (0.16 / step) * (1 + mutationPulse * 0.5);
    });
  }
}

seedInitialStars();
setStatus("running");
requestAnimationFrame(animate);

function makeShapeData(kind, seed) {
  if (kind === "scallop") return makePolarShape((a) => 0.82 + 0.12 * Math.sin(a * 18), 192);
  if (kind === "softBloom") return makePolarShape((a) => 0.68 + 0.22 * Math.pow(0.5 + 0.5 * Math.sin(a * 12), 0.7), 192);
  if (kind === "sunBurst") return makeStarShape(18, 0.72, 1.0, -Math.PI / 2);
  if (kind === "spikeBurst") return makeStarShape(13, 0.34, 1.06, -Math.PI / 2);
  if (kind === "hollowStar") return makeHollowShape((a) => 0.78 + 0.22 * Math.sign(Math.sin(a * 12)) * Math.pow(Math.abs(Math.sin(a * 12)), 0.2), () => 0.29, 160);
  if (kind === "hollowBloom") return makeHollowShape((a) => 0.72 + 0.2 * Math.sin(a * 10), (a) => 0.27 + 0.06 * Math.sin(a * 10 + Math.PI), 192);
  if (kind === "sevenStar") return makeStarShape(7, 0.52, 1.02, -Math.PI / 2);
  if (kind === "sparkle") return makeStarShape(4, 0.28, 1.08, -Math.PI / 2);
  if (kind === "flower") return makePolarShape((a) => 0.52 + 0.32 * Math.pow(0.5 + 0.5 * Math.sin(a * 6), 1.7), 192);
  if (kind === "pinwheel") return makePolarShape((a) => 0.7 + 0.22 * Math.sin(a * 5 + Math.sin(a * 2 + seed) * 0.8), 170);
  if (kind === "splash") return makePolarShape((a) => 0.68 + 0.25 * Math.sin(a * 9 + Math.sin(a * 4) * 1.4), 180);
  return makeAsteriskShape(8);
}

function makeStarShape(points, inner, outer, rotation) {
  const shape = new THREE.Shape();
  const outline = [];
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + (i / total) * Math.PI * 2;
    const point = new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    outline.push(point);
    if (i === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  }
  shape.closePath();
  return { shape, points: outline };
}

function makePolarShape(radiusFn, samples) {
  const shape = new THREE.Shape();
  const outline = [];
  for (let i = 0; i < samples; i += 1) {
    const angle = -Math.PI / 2 + (i / samples) * Math.PI * 2;
    const radius = radiusFn(angle);
    const point = new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    outline.push(point);
    if (i === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  }
  shape.closePath();
  return { shape, points: outline };
}

function makeHollowShape(outerFn, innerFn, samples) {
  const data = makePolarShape(outerFn, samples);
  const hole = new THREE.Path();
  const inner = [];
  for (let i = samples - 1; i >= 0; i -= 1) {
    const angle = -Math.PI / 2 + (i / samples) * Math.PI * 2;
    const radius = innerFn(angle);
    const point = new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    inner.push(point);
    if (i === samples - 1) hole.moveTo(point.x, point.y);
    else hole.lineTo(point.x, point.y);
  }
  hole.closePath();
  data.shape.holes.push(hole);
  return data;
}

function makeAsteriskShape(points) {
  const shape = new THREE.Shape();
  const outline = [];
  const armWidth = 0.09;
  for (let i = 0; i < points; i += 1) {
    const angle = -Math.PI / 2 + (i / points) * Math.PI * 2;
    const next = angle + Math.PI / points;
    const radius = i % 2 === 0 ? 1.05 : 0.26;
    const inset = i % 2 === 0 ? 0.36 : 0.22;
    const point = new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    const side = new THREE.Vector2(Math.cos(next) * inset + Math.cos(angle + Math.PI / 2) * armWidth, Math.sin(next) * inset + Math.sin(angle + Math.PI / 2) * armWidth);
    outline.push(point, side);
  }
  outline.forEach((point, i) => {
    if (i === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  return { shape, points: outline };
}

function createOutline(points, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Line(geometry, material);
}

function visibleBoundsAtDepth(depth) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const height = 2 * Math.tan(fov / 2) * Math.max(1, depth);
  return { width: height * camera.aspect, height };
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.fov = width < 760 ? 54 : width < 980 ? 50 : 46;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  const pixelRatio = renderer.getPixelRatio();
  postTarget.setSize(Math.max(1, width * pixelRatio), Math.max(1, height * pixelRatio));
  postUniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
}

function createParticleField(count, spread, size, colorA, colorB) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  for (let i = 0; i < count; i += 1) {
    const r = Math.pow(Math.random(), 0.55) * spread;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r * 0.66;
    positions[i * 3 + 2] = -Math.abs(Math.sin(phi) * Math.sin(theta) * r) - 5;
    tmpColor.copy(a).lerp(b, Math.random() * 0.55);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    transparent: true,
    opacity: 0.38,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

function createRadialTexture() {
  const size = 256;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.28, "rgba(120,230,255,0.45)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function smoothstepRange(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function triangleWave(value) {
  const f = fract(value);
  return 1 - Math.abs(f * 2 - 1) * 2;
}

function fract(value) {
  return value - Math.floor(value);
}

function rand(seed, offset) {
  return fract(Math.sin(seed * 127.1 + offset * 311.7) * 43758.5453123);
}

const audioEngine = {
  ctx: null,
  master: null,
  filter: null,
  delay: null,
  delayGain: null,
  compressor: null,
  noiseBuffer: null,
  interval: null,
  nextStepTime: 0,
  step: 0,
  bpm: 112,
  mutationIndex: 0,
  progressionIndex: 0,
  playing: false,

  async toggle() {
    if (!this.ctx) this.setup();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.playing = !this.playing;
    if (this.playing) {
      this.nextStepTime = this.ctx.currentTime + 0.06;
      this.interval = window.setInterval(() => this.scheduler(), 25);
      this.setVolume(state.volume);
    } else {
      window.clearInterval(this.interval);
      this.interval = null;
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.025);
    }
    return this.playing;
  },

  setup() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();
    this.delay = this.ctx.createDelay(0.45);
    this.delayGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();

    this.filter.type = "lowpass";
    this.filter.frequency.value = 1850;
    this.filter.Q.value = 0.7;
    this.delay.delayTime.value = 0.18;
    this.delayGain.gain.value = 0.16;
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.18;

    this.master.connect(this.filter);
    this.filter.connect(this.compressor);
    this.filter.connect(this.delay);
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    this.master.gain.value = 0;
    this.noiseBuffer = this.createNoiseBuffer();
  },

  setVolume(value) {
    if (!this.master || !this.ctx || !this.playing) return;
    this.master.gain.setTargetAtTime(Math.max(0.0001, value * value * 0.72), this.ctx.currentTime, 0.035);
  },

  mutate(key, value, energy) {
    this.mutationIndex += 1;
    this.progressionIndex = (this.progressionIndex + Math.ceil(value * 3 + 1)) % 4;
    this.bpm = 102 + energy * 42 + (this.mutationIndex % 5) * 2;
    if (!this.filter || !this.ctx) return;
    const now = this.ctx.currentTime;
    const frequency = 740 + value * 2400 + energy * 1900;
    this.filter.frequency.setTargetAtTime(frequency, now, 0.08);
    this.filter.Q.setTargetAtTime(0.55 + state.distort * 6 + state.pixelate * 2 + state.kaleido * 1.5, now, 0.08);
    this.delay.delayTime.setTargetAtTime(0.11 + state.mirror * 0.13 + state.magnetic * 0.09 + state.trail * 0.08, now, 0.08);
    this.delayGain.gain.setTargetAtTime(0.1 + state.pulse * 0.14 + state.trail * 0.12, now, 0.08);
    if (this.playing) this.playMutationSpark(now, key);
  },

  scheduler() {
    if (!this.ctx || !this.playing) return;
    const lookAhead = 0.15;
    while (this.nextStepTime < this.ctx.currentTime + lookAhead) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += 60 / this.bpm / 4;
      this.step += 1;
    }
  },

  scheduleStep(step, time) {
    const sixteenth = 60 / this.bpm / 4;
    const chord = this.getChord(Math.floor(step / 8));
    const beat = step % 16;
    const energy = aggregateEnergy();

    if (beat === 0 || beat === 8 || (energy > 0.68 && beat === 10)) this.playKick(time);
    if (beat === 4 || beat === 12) this.playSnare(time);
    if (step % 2 === 0) this.playHat(time, step % 4 === 0 ? 0.044 : 0.026);

    if (step % 8 === 0) {
      chord.forEach((freq, index) => {
        this.playTone(freq, time + index * 0.008, sixteenth * 7.6, "sawtooth", 0.034, -8 + index * 5);
        this.playTone(freq * 2, time + index * 0.012, sixteenth * 5.4, "triangle", 0.016, 3 + index * 2);
      });
    }

    const leadPattern = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];
    const gate = (step + this.mutationIndex) % (energy > 0.5 ? 2 : 4) === 0;
    if (gate) {
      const root = chord[0] / 2;
      const degree = leadPattern[(step / 2 + this.mutationIndex) % leadPattern.length | 0];
      const freq = root * Math.pow(2, degree / 12) * 2;
      this.playTone(freq, time, sixteenth * (1.2 + state.pulse), "square", 0.018 + energy * 0.012, this.mutationIndex % 2 ? 5 : -5);
    }
  },

  getChord(bar) {
    const progressions = [
      [0, 7, 9, 5],
      [0, 5, 9, 7],
      [9, 5, 0, 7],
      [0, 4, 7, 11],
    ];
    const root = 196 * Math.pow(2, (this.mutationIndex % 3) / 12);
    const chordRoot = progressions[this.progressionIndex][bar % 4];
    const base = root * Math.pow(2, chordRoot / 12);
    return [base, base * Math.pow(2, 4 / 12), base * Math.pow(2, 7 / 12), base * 2];
  },

  playTone(freq, time, duration, type, gainAmount, detune = 0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    const toneFilter = this.ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    osc.detune.setValueAtTime(detune + Math.sin(this.mutationIndex) * 3, time);
    toneFilter.type = "lowpass";
    toneFilter.frequency.setValueAtTime(980 + aggregateEnergy() * 2600, time);
    pan.pan.setValueAtTime(Math.sin(freq * 0.017 + this.mutationIndex) * 0.42, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainAmount), time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(toneFilter);
    toneFilter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.04);
  },

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(132, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.22, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.23);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.26);
  },

  playSnare(time) {
    const noise = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    noise.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1500 + state.pixelate * 1400 + state.kaleido * 500;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.12, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(time);
    noise.stop(time + 0.18);
  },

  playHat(time, amount) {
    const noise = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    noise.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = 6200;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(amount, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.052);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(time);
    noise.stop(time + 0.07);
  },

  playMutationSpark(time, key) {
    const base = key === "audio" ? 523.25 : 659.25 + (this.mutationIndex % 5) * 55;
    for (let i = 0; i < 5; i += 1) {
      this.playTone(base * Math.pow(2, i / 12), time + i * 0.017, 0.13 + i * 0.022, i % 2 ? "triangle" : "sine", 0.013, i * 4);
    }
  },

  createNoiseBuffer() {
    const length = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  },
};

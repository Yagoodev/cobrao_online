import * as THREE from "../vendor/three/three.module.min.js";

const DEFAULT_COLOR = new THREE.Color(0xffa800);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createParticleMaterial({ color, glow = false, additive = true, intensity = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uPointScale: { value: glow ? 150 : 70 },
      uTime: { value: 0 },
      uGain: { value: intensity },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aBrightness;
      attribute float aPhase;
      varying float vBrightness;
      varying float vPulse;

      uniform float uPointScale;
      uniform float uTime;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float pulse = 0.88 + sin(uTime * 1.7 + aPhase) * 0.12;
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = uPointScale * aSize * pulse / max(1.0, -viewPosition.z);
        vBrightness = aBrightness;
        vPulse = pulse;
      }
    `,
    fragmentShader: glow ? `
      uniform vec3 uColor;
      uniform float uGain;
      varying float vBrightness;
      varying float vPulse;

      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distanceFromCenter = length(point) * 2.0;
        float alpha = smoothstep(1.0, 0.0, distanceFromCenter);
        alpha = alpha * alpha * 0.38 * vBrightness * vPulse;
        gl_FragColor = vec4(mix(uColor * 1.55, vec3(2.0, 1.24, 0.24), 0.35) * uGain, alpha);
      }
    ` : `
      uniform vec3 uColor;
      uniform float uGain;
      varying float vBrightness;
      varying float vPulse;

      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distanceFromCenter = length(point) * 2.0;
        if (distanceFromCenter > 1.0) discard;
        float core = 1.0 - smoothstep(0.14, 0.72, distanceFromCenter);
        float halo = 1.0 - smoothstep(0.35, 1.0, distanceFromCenter);
        vec3 hotColor = mix(uColor * 1.75, vec3(2.35, 1.76, 0.52), core);
        float alpha = min(1.0, (core * 1.15 + halo * 0.72) * vBrightness * vPulse);
        gl_FragColor = vec4(hotColor * uGain, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
}

export function createDissolvingPillar({ seed = 9281, color = DEFAULT_COLOR, additive = true, intensity = 1 } = {}) {
  const random = seededRandom(seed);
  const positions = [];
  const sizes = [];
  const brightness = [];
  const phases = [];

  function addParticle(x, y, z, size = 1, light = 1) {
    positions.push(x, y, z);
    sizes.push(size);
    brightness.push(light);
    phases.push(random() * Math.PI * 2);
  }

  const half = 2.15;
  const cubeBottom = -0.05;
  const cubeTop = 4.25;

  // A strict square lattice makes the top plane read as a solid holographic cube.
  const topResolution = 21;
  for (let xIndex = 0; xIndex < topResolution; xIndex++) {
    for (let zIndex = 0; zIndex < topResolution; zIndex++) {
      const x = -half + (xIndex / (topResolution - 1)) * half * 2;
      const z = -half + (zIndex / (topResolution - 1)) * half * 2;
      addParticle(x + (random() - 0.5) * 0.035, cubeTop, z + (random() - 0.5) * 0.035, 0.72 + random() * 0.5, 0.78 + random() * 0.22);
    }
  }

  // Dense vertical faces preserve the cube silhouette from every orbit angle.
  const sideResolution = 19;
  const heightResolution = 15;
  for (let side = 0; side < 4; side++) {
    for (let alongIndex = 0; alongIndex < sideResolution; alongIndex++) {
      for (let heightIndex = 0; heightIndex < heightResolution; heightIndex++) {
        if (random() < heightIndex / heightResolution * 0.08) continue;
        const along = -half + (alongIndex / (sideResolution - 1)) * half * 2;
        const y = cubeBottom + (heightIndex / (heightResolution - 1)) * (cubeTop - cubeBottom);
        const jitter = (random() - 0.5) * 0.045;
        const x = side < 2 ? (side === 0 ? -half : half) + jitter : along;
        const z = side < 2 ? along : (side === 2 ? -half : half) + jitter;
        addParticle(x, y, z, 0.65 + random() * 0.7, 0.7 + random() * 0.3);
      }
    }
  }

  // Internal points give the upper block real volume rather than a wireframe shell.
  for (let i = 0; i < 430; i++) {
    addParticle(
      (random() * 2 - 1) * half,
      cubeBottom + random() * (cubeTop - cubeBottom),
      (random() * 2 - 1) * half,
      0.55 + random() * 0.8,
      0.42 + random() * 0.5,
    );
  }

  // Below the cube, probability and radius collapse together to form the dissolve.
  const dissolveTop = cubeBottom;
  const dissolveBottom = -4.4;
  for (let i = 0; i < 1050; i++) {
    const depth = Math.pow(random(), 1.55);
    const y = dissolveTop - depth * (dissolveTop - dissolveBottom);
    const remaining = (y - dissolveBottom) / (dissolveTop - dissolveBottom);
    const radius = half * (0.12 + Math.pow(remaining, 0.72) * 0.88);
    const irregularity = (1 - remaining) * 0.7;
    const angle = random() * Math.PI * 2;
    const radial = Math.sqrt(random()) * radius;
    const x = Math.cos(angle) * radial + (random() - 0.5) * irregularity;
    const z = Math.sin(angle) * radial + (random() - 0.5) * irregularity;
    const keep = 0.28 + remaining * 0.72;
    if (random() > keep) continue;
    addParticle(x, y, z, 0.45 + random() * (0.65 + remaining * 0.4), 0.38 + random() * 0.62);
  }

  // A few detached particles extend the tail and sell the vertical disintegration.
  for (let i = 0; i < 62; i++) {
    const depth = Math.pow(random(), 0.72);
    const y = -4.5 - depth * 3.1;
    const spread = 0.14 + depth * 0.6;
    addParticle(
      (random() * 2 - 1) * spread,
      y,
      (random() * 2 - 1) * spread,
      0.38 + random() * 0.78,
      0.42 + random() * 0.58,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aBrightness", new THREE.Float32BufferAttribute(brightness, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = "dissolving-particle-pillar";

  const glowMaterial = createParticleMaterial({ color, glow: true, additive, intensity });
  const coreMaterial = createParticleMaterial({ color, glow: false, additive, intensity });
  const glow = new THREE.Points(geometry, glowMaterial);
  const core = new THREE.Points(geometry, coreMaterial);
  glow.name = "particle-glow";
  core.name = "particle-core";
  glow.renderOrder = 0;
  core.renderOrder = 1;
  group.add(glow, core);

  group.userData.update = (elapsedSeconds) => {
    glowMaterial.uniforms.uTime.value = elapsedSeconds;
    coreMaterial.uniforms.uTime.value = elapsedSeconds;
  };
  group.userData.dispose = () => {
    geometry.dispose();
    glowMaterial.dispose();
    coreMaterial.dispose();
  };

  return group;
}

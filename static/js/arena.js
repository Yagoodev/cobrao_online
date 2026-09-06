import * as THREE from "../vendor/three/three.module.min.js";

const GRID_SIZE = 21;
const FLOOR_Y = 0.36;

// All scenery is procedural and seeded: reloads keep the same little world.
export function createArena(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const island = new THREE.Group();
  scene.add(island);
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 160);
  camera.position.set(30, 34, 38);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xf5ffe5, 0x71826b, 1.7));
  const sun = new THREE.DirectionalLight(0xffedc9, 2.3);
  sun.position.set(-16, 30, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 3;
  scene.add(sun);

  let seed = 173;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const between = (a, b) => a + (b - a) * random();
  const pick = (items) => items[Math.floor(random() * items.length)];
  const materials = new Map();
  const geometries = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
    return materials.get(color);
  }
  function geometry(key, make) {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  }
  function mesh(geo, mat, x, y, z, parent = island) {
    const object = new THREE.Mesh(geo, typeof mat === "string" ? material(mat) : mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  // Beveled stone catches a bright rim without using external models or textures.
  function box(w, h, d, x, y, z, color, bevel = 0.06, parent = island) {
    const geo = geometry(`box:${w}:${h}:${d}:${bevel}`, () => {
      if (!bevel) return new THREE.BoxGeometry(w, h, d);
      const shape = new THREE.Shape();
      const hw = w / 2 - bevel, hh = h / 2 - bevel;
      shape.moveTo(-hw, -hh); shape.lineTo(hw, -hh); shape.lineTo(hw, hh); shape.lineTo(-hw, hh); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: d - bevel * 2, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: bevel, bevelThickness: bevel });
      g.translate(0, 0, -d / 2 + bevel);
      return g;
    });
    return mesh(geo, color, x, y, z, parent);
  }
  const sphere = geometry("sphere", () => new THREE.SphereGeometry(1, 12, 8));
  const rock = geometry("rock", () => new THREE.DodecahedronGeometry(1, 0));
  function blob(x, y, z, sx, sy, sz, color, faceted = false, parent = island) {
    const object = mesh(faceted ? rock : sphere, color, x, y, z, parent);
    object.scale.set(sx, sy, sz);
    return object;
  }

  // The soil is visible below the turf, separated from the soft shadow underneath.
  box(25.4, 1.35, 25.4, 0, -1.4, 0, "#756b51", 0.4);
  box(26, 0.95, 26, 0, -0.6, 0, "#a68d61", 0.25);
  box(26.2, 0.34, 26.2, 0, 0.025, 0, "#65883d", 0.12);

  function groundTexture() {
    const surface = document.createElement("canvas");
    surface.width = surface.height = 1024;
    const ctx = surface.getContext("2d");
    ctx.fillStyle = "#719b45";
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 1300; i++) {
      ctx.fillStyle = pick(["#739f48", "#7ba84e", "#68943f", "#86ab54"]);
      ctx.beginPath();
      ctx.ellipse(random() * 1024, random() * 1024, between(3, 28), between(3, 20), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Worn sandy footpath leads from the steps into the clearing.
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#bcb074"; ctx.lineWidth = 88;
    ctx.beginPath(); ctx.moveTo(682, 1040); ctx.bezierCurveTo(685, 850, 390, 820, 325, 630); ctx.bezierCurveTo(260, 465, 175, 440, 55, 440); ctx.stroke();
    ctx.strokeStyle = "#c7b87b"; ctx.lineWidth = 67; ctx.stroke();
    for (let i = 0; i < 17000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#ffffff0b" : "#243c1709";
      ctx.fillRect(random() * 1024, random() * 1024, between(1, 3), between(1, 4));
    }
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  const turfTexture = groundTexture();
  const turfMaterial = new THREE.MeshStandardMaterial({ map: turfTexture, roughness: 1 });
  box(25.7, 0.2, 25.7, 0, FLOOR_Y - 0.1, 0, "#83a34c", 0.06);
  const turf = mesh(new THREE.PlaneGeometry(25.58, 25.58), turfMaterial, 0, FLOOR_Y + 0.006, 0);
  turf.rotation.x = -Math.PI / 2;
  turf.castShadow = false;

  // Outer retaining stones and low courtyard walls, outside the 21 × 21 game grid.
  const stones = ["#b6a67d", "#c1b18a", "#bbaa81", "#c9b990"];
  const caps = ["#d6c89d", "#e0d0a5", "#d8c99e"];
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 14; i++) {
      const along = -12.03 + i * 1.85;
      const x = side < 2 ? along : (side === 2 ? -12.73 : 12.73);
      const z = side < 2 ? (side === 0 ? -12.73 : 12.73) : along;
      const brick = box(1.8, 0.48, 0.4, x, -0.55, z, pick(stones));
      if (side >= 2) brick.rotation.y = Math.PI / 2;
    }
  }
  function wall(axis, fixed, start, end, front = false) {
    const n = Math.ceil((end - start) / 1.55);
    const step = (end - start) / n;
    for (let i = 0; i < n; i++) {
      const a = start + step * (i + 0.5);
      const x = axis === "x" ? a : fixed, z = axis === "x" ? fixed : a;
      const height = front ? 0.6 : 0.95;
      const body = box(step - 0.035, height, 0.83, x, FLOOR_Y + height / 2, z, pick(stones), 0.07);
      const cap = box(step - 0.02, 0.25, 1.05, x, FLOOR_Y + height + 0.1, z, pick(caps), 0.065);
      if (axis === "z") { body.rotation.y = Math.PI / 2; cap.rotation.y = Math.PI / 2; }
    }
  }
  wall("x", -11.2, -11.65, 11.65);
  wall("z", -11.2, -10.7, 11.5);
  wall("z", 11.2, -10.7, 11.5);
  wall("x", 11.2, -10.7, 2.7, true);
  wall("x", 11.2, 6, 10.7, true);
  for (let i = 0; i < 4; i++) {
    box(3.1, 0.3, 0.73, 4.35, FLOOR_Y - i * 0.25, 11.35 + i * 0.63, pick(caps), 0.07);
  }
  for (const x of [2.65, 6.05]) {
    box(0.65, 0.92, 0.95, x, 0.72, 11.3, "#c1b18a");
    box(0.84, 0.24, 1.12, x, 1.24, 11.3, "#e0d0a5");
  }

  function tree(x, z, size = 1) {
    const trunk = geometry("trunk", () => new THREE.CylinderGeometry(0.22, 0.38, 2.1, 7));
    mesh(trunk, "#806747", x, FLOOR_Y + 0.92 * size, z).scale.setScalar(size);
    blob(x, 0.52, z, size * 0.9, 0.14, size * 0.8, "#597c3f");
    const foliage = ["#42794b", "#528a4f", "#5b9352", "#659d55"];
    for (const [dx, dy, dz, scale] of [[0, 2.7, 0, 1.18], [-0.7, 2.08, 0.12, 0.85], [0.68, 2.2, 0.1, 0.88], [0, 2.23, -0.65, 0.89], [0.05, 2.14, 0.65, 0.88]]) {
      blob(x + dx * size, FLOOR_Y + dy * size, z + dz * size, scale * size, scale * size * 0.91, scale * size, pick(foliage));
    }
  }
  tree(-11.9, -11.85, 1.06);
  tree(-7.9, -12.1, 0.81);
  tree(9.5, -12, 1.05);
  tree(-12.05, -6.8, 0.82);
  tree(12, -5.8, 0.76);

  function bush(x, z, size = 1) {
    for (const [dx, dz, s] of [[-0.35, 0, 0.52], [0.32, 0.05, 0.6], [0, -0.25, 0.65]]) {
      blob(x + dx * size, FLOOR_Y + s * size * 0.56, z + dz * size, s * size, s * size * 0.8, s * size, pick(["#568749", "#65964d", "#719e53"]));
    }
  }
  [[-12, 4], [-12, 7.3], [-12, -1.3], [12, 3.8], [12, 7.8], [5.5, -12.1], [-3.8, -12.1], [0, -12.1], [-8.7, 12], [9.8, 12]].forEach(([x, z]) => bush(x, z, between(0.8, 1.2)));

  // Instanced blades give the borders texture while keeping draw calls low.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute("position", new THREE.Float32BufferAttribute([-0.075, 0, 0, 0.075, 0, 0, 0.10, 0.62, 0.06], 3));
  blade.computeVertexNormals();
  const grassMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 1 });
  const grass = new THREE.InstancedMesh(blade, grassMaterial, 1600);
  const transform = new THREE.Object3D();
  const grassColor = new THREE.Color();
  for (let i = 0; i < grass.count; i++) {
    const side = i % 4;
    const along = between(-12.55, 12.55), edge = between(11.9, 12.65);
    let x = side < 2 ? along : edge * (side === 2 ? -1 : 1);
    let z = side < 2 ? edge * (side === 0 ? -1 : 1) : along;
    if (z > 11 && x > 2.4 && x < 6.2) x -= 5;
    transform.position.set(x, FLOOR_Y, z);
    transform.rotation.set(between(-0.25, 0.25), random() * Math.PI * 2, between(-0.2, 0.2));
    transform.scale.setScalar(between(0.45, 1.35));
    transform.updateMatrix();
    grass.setMatrixAt(i, transform.matrix);
    grassColor.set(pick(["#668d42", "#88aa51", "#537d40", "#a0b965"]));
    grass.setColorAt(i, grassColor);
  }
  grass.castShadow = false; grass.receiveShadow = true;
  island.add(grass);

  // Sparse low details inside the clearing are decorative, never collision objects.
  for (let i = 0; i < 70; i++) {
    const x = between(-10.5, 10.5), z = between(-10.5, 10.5);
    if (Math.abs(x) < 7.4 && Math.abs(z) < 7.8) continue;
    const s = between(0.07, 0.17);
    blob(x, FLOOR_Y + 0.035, z, s, s * 0.4, s * 0.75, pick(["#bdba87", "#9aab64", "#738f47"]), true);
  }
  function flower(x, z, color) {
    const stem = geometry("stem", () => new THREE.CylinderGeometry(0.018, 0.025, 0.36, 4));
    mesh(stem, "#577d3e", x, FLOOR_Y + 0.16, z);
    for (let k = 0; k < 5; k++) {
      const angle = k * Math.PI * 2 / 5;
      blob(x + Math.cos(angle) * 0.08, FLOOR_Y + 0.36, z + Math.sin(angle) * 0.08, 0.085, 0.04, 0.085, color);
    }
    blob(x, FLOOR_Y + 0.39, z, 0.046, 0.038, 0.046, "#e3bc59");
  }
  for (const [cx, cz] of [[-11.9, 9.5], [11.95, 1.3], [3, -12], [-11.95, -3], [-4, 12]]) {
    for (let i = 0; i < 7; i++) flower(cx + between(-0.35, 0.35), cz + between(-0.7, 0.7), pick(["#f4eacb", "#f3d783", "#d8b1aa"]));
  }
  for (const [x, z] of [[-12, 5.3], [12, -3.3], [-4.4, -12]]) {
    mesh(geometry("mushroom-stem", () => new THREE.CylinderGeometry(0.08, 0.11, 0.34, 8)), "#e0d5ad", x, FLOOR_Y + 0.16, z);
    blob(x, FLOOR_Y + 0.34, z, 0.3, 0.14, 0.3, "#b7784c");
  }
  // Ivy trails down the exposed sides to make the depth of the floating island clear.
  for (const [x, z] of [[-9, 12.95], [-7.5, 12.95], [8.5, 12.95], [12.95, 1.2], [12.95, 2.1], [12.95, 8.1]]) {
    for (let i = 0; i < 8; i++) {
      blob(x + between(-0.15, 0.15), 0.1 - i * 0.23, z + between(-0.1, 0.1), 0.2, 0.21, 0.12, pick(["#567e43", "#6e914b", "#7c9d51"]), true);
    }
  }

  // Batch repeated static meshes (leaves, petals, masonry) into shared GPU draws.
  island.updateMatrixWorld(true);
  const batches = new Map();
  for (const object of [...island.children]) {
    if (!object.isMesh || object.isInstancedMesh) continue;
    const key = `${object.geometry.uuid}:${object.material.uuid}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(object);
  }
  for (const objects of batches.values()) {
    if (objects.length < 3) continue;
    const batch = new THREE.InstancedMesh(objects[0].geometry, objects[0].material, objects.length);
    objects.forEach((object, i) => { batch.setMatrixAt(i, object.matrix); island.remove(object); });
    batch.castShadow = true; batch.receiveShadow = true;
    island.add(batch);
  }

  // A radial contact shadow floats well below the island; no visible floor plane.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d");
  const gradient = shadowContext.createRadialGradient(64, 64, 5, 64, 64, 64);
  gradient.addColorStop(0, "rgba(48,64,35,0.32)");
  gradient.addColorStop(0.45, "rgba(48,64,35,0.18)");
  gradient.addColorStop(1, "rgba(48,64,35,0)");
  shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(34, 29), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.6, -5.5, 3);
  scene.add(shadow);

  // Existing server snapshots are projected onto x/z; this module owns no game rules.
  const snake = new THREE.Group();
  island.add(snake);
  const segments = [];
  function drawGame(game) {
    const body = game.snake.body;
    while (segments.length < body.length) {
      const i = segments.length;
      const part = new THREE.Group();
      snake.add(part);
      blob(0, 0, 0, i === 0 ? 0.52 : 0.43, 0.4, 0.44, i === 0 ? "#d5ab48" : "#bd943c", false, part);
      if (i === 0) {
        for (const side of [-1, 1]) {
          blob(side * 0.26, 0.24, -0.29, 0.13, 0.14, 0.10, "#fff4cf", false, part);
          blob(side * 0.26, 0.24, -0.37, 0.065, 0.075, 0.035, "#293c2b", false, part);
        }
      }
      segments.push(part);
    }
    segments.forEach((part, i) => {
      part.visible = i < body.length;
      if (!part.visible) return;
      part.position.set(body[i].x - (GRID_SIZE - 1) / 2, FLOOR_Y + 0.4, body[i].y - (GRID_SIZE - 1) / 2);
      if (i === 0 && game.snake.direction) {
        part.rotation.y = Math.atan2(-game.snake.direction.x, -game.snake.direction.y);
      }
    });
    render();
  }

  // Fit the projected island bounds, not the window, keeping equal breathing room.
  const bounds = new THREE.Box3().setFromObject(island);
  camera.updateMatrixWorld(true);
  const projected = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    }
  }
  const center = projected.getCenter(new THREE.Vector3());
  const size = projected.getSize(new THREE.Vector3());
  let disposed = false;
  function render() { if (!disposed && !document.hidden) renderer.render(scene, camera); }
  function resize() {
    if (disposed) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect)) * 1.12;
    camera.left = center.x - halfHeight * aspect;
    camera.right = center.x + halfHeight * aspect;
    camera.top = center.y + halfHeight;
    camera.bottom = center.y - halfHeight;
    camera.updateProjectionMatrix();
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  document.addEventListener("visibilitychange", render);
  resize();

  return {
    drawGame,
    dispose() {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", render);
      const usedGeometries = new Set(), usedMaterials = new Set();
      scene.traverse((object) => {
        if (object.geometry) usedGeometries.add(object.geometry);
        if (object.material) usedMaterials.add(object.material);
        if (object.isInstancedMesh) object.dispose();
      });
      usedGeometries.forEach((geo) => geo.dispose());
      usedMaterials.forEach((mat) => mat.dispose());
      turfTexture.dispose(); shadowTexture.dispose(); sun.shadow.dispose(); renderer.dispose();
    },
  };
}

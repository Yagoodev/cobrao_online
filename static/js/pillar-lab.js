import * as THREE from "../vendor/three/three.module.min.js";
import { createDissolvingPillar } from "./floating-pillar.js";

const canvas = document.querySelector("#object");
const select = document.querySelector("#object-select");
const description = document.querySelector("#object-description");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.024);
scene.add(new THREE.HemisphereLight(0xffd46c, 0x120700, 1.8));
const keyLight = new THREE.DirectionalLight(0xffc052, 3.2);
keyLight.position.set(-5, 8, 10);
scene.add(keyLight);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
const viewTarget = new THREE.Vector3();

function createSun() {
  const group = new THREE.Group();
  group.name = "sun-preview";
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0xffa000,
      emissive: 0xff6800,
      emissiveIntensity: 0.78,
      roughness: 0.74,
      metalness: 0,
    }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(4.25, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffa800,
      transparent: true,
      opacity: 0.13,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  group.add(sphere, halo);
  group.userData.update = (elapsed) => {
    halo.scale.setScalar(1 + Math.sin(elapsed * 1.1) * 0.018);
  };
  return group;
}

const OBJECTS = {
  pillar: {
    label: "Pilar de partículas",
    description: "Cubo holográfico volumétrico que se dissolve em uma cauda de partículas douradas.",
    create: () => createDissolvingPillar({ seed: 80421 }),
    position: [0, 0.6, 0],
    rotation: [-0.04, -0.48, 0],
    camera: [14.5, 5.7, 23],
    target: [0, -1.2, 0],
    zoom: [10, 28],
  },
  sun: {
    label: "Sol 3D",
    description: "Esfera emissiva dourada com volume, sombreamento suave e halo pulsante.",
    create: createSun,
    position: [0, 0, 0],
    rotation: [-0.08, -0.38, 0],
    camera: [10.2, 3.3, 15.8],
    target: [0, 0, 0],
    zoom: [7, 23],
  },
};

let activeObject;
let activeDefinition;
let dragging = false;
let previousX = 0;
let previousY = 0;
let targetRotationX = 0;
let targetRotationY = 0;

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else if (child.material) materials.add(child.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function showObject(objectId, updateUrl = true) {
  const definition = OBJECTS[objectId] || OBJECTS.pillar;
  if (activeObject) {
    scene.remove(activeObject);
    disposeObject(activeObject);
  }

  activeDefinition = definition;
  activeObject = definition.create();
  activeObject.position.fromArray(definition.position);
  activeObject.rotation.fromArray(definition.rotation);
  scene.add(activeObject);

  targetRotationX = definition.rotation[0];
  targetRotationY = definition.rotation[1];
  camera.position.fromArray(definition.camera);
  viewTarget.fromArray(definition.target);
  camera.lookAt(viewTarget);

  select.value = objectId in OBJECTS ? objectId : "pillar";
  description.textContent = definition.description;
  canvas.setAttribute("aria-label", `Visualização 3D: ${definition.label}`);
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("object", select.value);
    window.history.replaceState(null, "", url);
  }
}

select.addEventListener("change", () => showObject(select.value));
canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  previousX = event.clientX;
  previousY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  targetRotationY += (event.clientX - previousX) * 0.007;
  targetRotationX = THREE.MathUtils.clamp(targetRotationX + (event.clientY - previousY) * 0.004, -0.65, 0.65);
  previousX = event.clientX;
  previousY = event.clientY;
});
canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener("pointercancel", () => { dragging = false; });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const [minimum, maximum] = activeDefinition.zoom;
  const offset = camera.position.clone().sub(viewTarget);
  offset.multiplyScalar(event.deltaY > 0 ? 1.06 : 0.94).clampLength(minimum, maximum);
  camera.position.copy(viewTarget).add(offset);
  camera.lookAt(viewTarget);
}, { passive: false });

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const initialObject = new URL(window.location.href).searchParams.get("object") || "pillar";
showObject(initialObject, false);

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  if (!dragging) targetRotationY += 0.0016;
  activeObject.rotation.y += (targetRotationY - activeObject.rotation.y) * 0.075;
  activeObject.rotation.x += (targetRotationX - activeObject.rotation.x) * 0.075;
  activeObject.userData.update?.(elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
resize();
animate();

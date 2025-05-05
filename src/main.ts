import * as THREE from 'three';
import { OrbitControls, GLTFLoader, SkeletonUtils } from 'three-stdlib';
import { CharacterControls } from './characterControls';
import { createLoadingScreen, removeLoadingScreen } from './loadingScreen';

const fontLink = document.createElement('link');
fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

const loadingScreen = createLoadingScreen();

const manager = new THREE.LoadingManager();
manager.onProgress = () => {
  const loadingText = loadingScreen.querySelector('p');
  if (loadingText) {
    loadingText.innerText = "Loading...";
  }
};
manager.onLoad = () => {
  removeLoadingScreen();
};
manager.onError = (url) => {
  console.error(`Error loading: ${url}`);
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87cefa);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI / 2 - 0.1;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(50, 100, 50);
dir.castShadow = true;
dir.shadow.mapSize.width = 4096;
dir.shadow.mapSize.height = 4096;
dir.shadow.camera.left = -200;
dir.shadow.camera.right = 200;
dir.shadow.camera.top = 200;
dir.shadow.camera.bottom = -200;
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 1000;
dir.shadow.bias = -0.0001;
dir.shadow.radius = 4;
dir.shadow.camera.updateProjectionMatrix();
scene.add(dir);

function createTileTexture() {
  const size = 512;
  const mainDivisions = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = "#0F8C1F";
  ctx.fillRect(0, 0, size, size);
  const mainTileSize = size / mainDivisions;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.25;
  for (let i = 0; i <= mainDivisions; i++) {
    const pos = i * mainTileSize;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  for (let i = 0; i < mainDivisions; i++) {
    for (let j = 0; j < mainDivisions; j++) {
      const tileX = i * mainTileSize;
      const tileY = j * mainTileSize;
      const vx = tileX + mainTileSize / 2;
      ctx.beginPath();
      ctx.moveTo(vx, tileY);
      ctx.lineTo(vx, tileY + mainTileSize);
      ctx.stroke();
      const hy = tileY + mainTileSize / 2;
      ctx.beginPath();
      ctx.moveTo(tileX, hy);
      ctx.lineTo(tileX + mainTileSize, hy);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(50, 50);
  return texture;
}

const groundMat = new THREE.MeshStandardMaterial({
  map: createTileTexture(),
  side: THREE.DoubleSide,
  color: "#0F8C1F",
  roughness: 0.9,
  metalness: 0.0
});
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.rotation.z = -0.40;
ground.receiveShadow = true;
scene.add(ground);

let controls: CharacterControls;
const loaderGorilla = new GLTFLoader(manager);
loaderGorilla.load('models/Gorilla.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(1.5, 1.5, 1.5);
  model.traverse((object: any) => { if (object.isMesh) object.castShadow = true; });
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const map = new Map<string, THREE.AnimationAction>();
  for (const clip of gltf.animations) {
    const name = clip.name.replace(/^loop/i, '');
    if (/Idle|Walk|Run|Jump/i.test(name)) {
      map.set(name, mixer.clipAction(clip));
    }
  }
  controls = new CharacterControls(model, mixer, map, orbit, camera);
});

const mixers: THREE.AnimationMixer[] = [];
const men: THREE.Object3D[] = [];
(window as any).men = men;

const loaderMan = new GLTFLoader(manager);
loaderMan.load('models/Man.glb', (gltf) => {
  const idleClip = gltf.animations.find(clip => /Idle/i.test(clip.name));
  for (let i = 0; i < 100; i++) {
    const man = SkeletonUtils.clone(gltf.scene);
    man.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const safeZone = 5;
    let x = 0, z = 0;
    do {
      const radius = Math.random() * 50;
      const angle = Math.random() * Math.PI * 2;
      x = radius * Math.cos(angle);
      z = radius * Math.sin(angle);
    } while (Math.sqrt(x * x + z * z) < safeZone);
    man.position.set(x, 0, z);
    man.userData.collisionRadius = 1;
    men.push(man);
    const mixer = new THREE.AnimationMixer(man);
    if (idleClip) { mixer.clipAction(idleClip).reset().play(); }
    mixers.push(mixer);
    scene.add(man);
  }
});

const keys: Record<string, boolean> = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  if (controls) controls.update(dt, keys);
  mixers.forEach(mixer => mixer.update(dt));
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
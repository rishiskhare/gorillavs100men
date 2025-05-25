import * as THREE from "three";
import { OrbitControls, GLTFLoader, SkeletonUtils } from "three-stdlib";
import { CharacterControls } from "./characterControls";
import { createLoadingScreen, removeLoadingScreen } from "./loadingScreen";
import { Human } from "./human";

const fontLink = document.createElement("link");
fontLink.href =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

const fontLink2 = document.createElement("link");
fontLink2.href =
  "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
fontLink2.rel = "stylesheet";
document.head.appendChild(fontLink2);

const loadingScreen = createLoadingScreen();

const manager = new THREE.LoadingManager();
manager.onProgress = () => {
  const loadingText = loadingScreen.querySelector("p");
  if (loadingText) {
    loadingText.innerText = "Loading...";
  }
};
manager.onLoad = () => {
  removeLoadingScreen();
  animate();
};
manager.onError = (url) => {
  console.error(`Error loading: ${url}`);
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87cefa);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
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
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
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
  metalness: 0.0,
});
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.rotation.z = -0.4;
ground.receiveShadow = true;
scene.add(ground);

let controls: CharacterControls;
let gorillaModel: THREE.Group;
const loaderGorilla = new GLTFLoader(manager);
loaderGorilla.load("models/Gorilla.glb", (gltf) => {
  gorillaModel = gltf.scene;
  gorillaModel.scale.set(1.75, 1.75, 1.75);
  gorillaModel.traverse((object: any) => {
    if (object.isMesh) object.castShadow = true;
  });
  scene.add(gorillaModel);
  const mixer = new THREE.AnimationMixer(gorillaModel);
  const map = new Map<string, THREE.AnimationAction>();
  for (const clip of gltf.animations) {
    const name = clip.name.replace(/^loop/i, "");
    if (/Idle|Walk|Run|Jump|Attack/i.test(name)) {
      map.set(name, mixer.clipAction(clip));
    }
  }
  controls = new CharacterControls(gorillaModel, mixer, map, orbit, camera, GORILLA_MAX_HEALTH);
  gorillaModel.userData.controls = controls;
  createGorillaHealthBarUI();
  const initialGorillaHealth = controls.getGorillaHealthState();
  (window as any).updateGorillaHealthDisplay(initialGorillaHealth.current, initialGorillaHealth.max);
  if (men.length > 0) {
    human = new Human(men, gorillaModel);
    controls.setHumanRef(human);
  }
  gorillaModel.userData.camera = camera;
});

const mixers: THREE.AnimationMixer[] = [];
const men: THREE.Object3D[] = [];
(window as any).men = men;
let human: Human;

const loaderMan = new GLTFLoader(manager);
loaderMan.load("models/Man.glb", (gltf) => {
  const manAnimations = gltf.animations;
  const idleClip = manAnimations.find((clip) => /Idle/i.test(clip.name));
  const runClip = manAnimations.find((clip) => /Run/i.test(clip.name));
  const deathClip = manAnimations.find((clip) => /Death|Die/i.test(clip.name));
  const punchRightClip = manAnimations.find((clip) => /Punch_Right/i.test(clip.name));
  const punchLeftClip = manAnimations.find((clip) => /Punch_Left/i.test(clip.name));
  const kickRightClip = manAnimations.find((clip) => /Kick_Right/i.test(clip.name));
  const kickLeftClip = manAnimations.find((clip) => /Kick_Left/i.test(clip.name));

  for (let i = 0; i < 100; i++) {
    const man = SkeletonUtils.clone(gltf.scene);
    man.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const safeZone = 5;
    let x = 0,
      z = 0;
    do {
      const radius = Math.random() * 50 + safeZone;
      const angle = Math.random() * Math.PI * 2;
      x = radius * Math.cos(angle);
      z = radius * Math.sin(angle);
    } while (Math.sqrt(x * x + z * z) < safeZone);
    man.position.set(x, 0, z);
    man.userData.collisionRadius = 1;
    men.push(man);

    const mixer = new THREE.AnimationMixer(man);
    const actions = new Map<string, THREE.AnimationAction>();
    if (idleClip) actions.set("Idle", mixer.clipAction(idleClip));
    if (runClip) actions.set("Run", mixer.clipAction(runClip));
    if (deathClip) actions.set("Death", mixer.clipAction(deathClip));
    if (punchRightClip) actions.set("Punch_Right", mixer.clipAction(punchRightClip));
    if (punchLeftClip) actions.set("Punch_Left", mixer.clipAction(punchLeftClip));
    if (kickRightClip) actions.set("Kick_Right", mixer.clipAction(kickRightClip));
    if (kickLeftClip) actions.set("Kick_Left", mixer.clipAction(kickLeftClip));
    man.userData.mixer = mixer;
    man.userData.actions = actions;
    man.userData.currentAction = "Idle";

    mixers.push(mixer);
    scene.add(man);
  }

  if (gorillaModel) {
    human = new Human(men, gorillaModel);
    if (controls) {
        controls.setHumanRef(human);
    }
    gorillaModel.userData.camera = camera;
    gorillaModel.userData.controls = controls;
  }
});

const keys: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  if (controls) controls.update(dt, keys);
  if (human) human.update(dt);
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

let gorillaHealthBarContainer: HTMLDivElement;
let gorillaHealthFill: HTMLDivElement;
let gorillaHealthText: HTMLDivElement;

const GORILLA_MAX_HEALTH = 500;

function createGorillaHealthBarUI() {
  gorillaHealthBarContainer = document.createElement('div');
  gorillaHealthBarContainer.style.position = 'absolute';
  gorillaHealthBarContainer.style.top = '20px';
  gorillaHealthBarContainer.style.left = '20px';
  gorillaHealthBarContainer.style.display = 'flex';
  gorillaHealthBarContainer.style.alignItems = 'center';
  gorillaHealthBarContainer.style.fontFamily = '"Press Start 2P", monospace';
  gorillaHealthBarContainer.style.zIndex = '100';

  const label = document.createElement('span');
  label.textContent = 'GORILLA HP:';
  label.style.color = '#FFFFFF';
  label.style.fontSize = '16px';
  label.style.marginRight = '10px';
  label.style.textShadow = '2px 2px 0 #000000';

  const barBackground = document.createElement('div');
  barBackground.style.width = '250px';
  barBackground.style.height = '25px';
  barBackground.style.backgroundColor = '#2d2d2d';
  barBackground.style.border = '3px solid #000000';
  barBackground.style.position = 'relative';
  barBackground.style.boxShadow = 
    'inset 2px 2px 0 #1a1a1a, inset -2px -2px 0 #404040';

  gorillaHealthFill = document.createElement('div');
  gorillaHealthFill.style.height = '100%';
  gorillaHealthFill.style.backgroundColor = '#00ff00';
  gorillaHealthFill.style.transition = 'width 0.3s ease-out';
  gorillaHealthFill.style.boxShadow = 'inset 1px 1px 0 #88ff88';

  gorillaHealthText = document.createElement('div');
  gorillaHealthText.style.position = 'absolute';
  gorillaHealthText.style.top = '50%';
  gorillaHealthText.style.left = '50%';
  gorillaHealthText.style.transform = 'translate(-50%, -50%)';
  gorillaHealthText.style.color = '#FFFFFF';
  gorillaHealthText.style.fontSize = '12px';
  gorillaHealthText.style.textShadow = '1px 1px 0 #000000';

  barBackground.appendChild(gorillaHealthFill);
  barBackground.appendChild(gorillaHealthText);
  gorillaHealthBarContainer.appendChild(label);
  gorillaHealthBarContainer.appendChild(barBackground);
  document.body.appendChild(gorillaHealthBarContainer);
}

(window as any).updateGorillaHealthDisplay = (currentHealth: number, maxHealth: number) => {
  if (!gorillaHealthFill || !gorillaHealthText) return;

  const percentage = (currentHealth / maxHealth) * 100;
  gorillaHealthFill.style.width = percentage + '%';
  gorillaHealthText.textContent = currentHealth + '/' + maxHealth;

  if (percentage <= 15) {
    gorillaHealthFill.style.backgroundColor = '#ff0000';
    gorillaHealthFill.style.boxShadow = 'inset 1px 1px 0 #ff8888';
  } else if (percentage <= 35) {
    gorillaHealthFill.style.backgroundColor = '#ff8800';
    gorillaHealthFill.style.boxShadow = 'inset 1px 1px 0 #ffcc88';
  } else if (percentage <= 65) {
    gorillaHealthFill.style.backgroundColor = '#ffff00';
    gorillaHealthFill.style.boxShadow = 'inset 1px 1px 0 #ffff88';
  } else {
    gorillaHealthFill.style.backgroundColor = '#00ff00';
    gorillaHealthFill.style.boxShadow = 'inset 1px 1px 0 #88ff88';
  }
};

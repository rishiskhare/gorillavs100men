import * as THREE from "three";
import { OrbitControls, GLTFLoader, SkeletonUtils } from "three-stdlib";
import { CharacterControls } from "./characterControls";
import { createLoadingScreen, removeLoadingScreen, updateLoadingProgress } from "./loadingScreen";
import { Human } from "./human";

const NUM_HUMANS = 100;

createLoadingScreen();
updateLoadingProgress(0);

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
  const progress = (itemsLoaded / itemsTotal) * 100;
  updateLoadingProgress(progress);
};
manager.onLoad = () => {
  updateLoadingProgress(100);
  setTimeout(() => {
    removeLoadingScreen();
    animate();
  }, 500);
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
let human: Human;
let gorillaLoaded = false;
let menLoaded = false;

function tryInitializeGameLogic() {
  if (gorillaLoaded && menLoaded && !human) {
    if (men.length > 0 && gorillaModel) {
      human = new Human(men, gorillaModel, displayVictoryScreen);
      if (controls) {
        controls.setHumanRef(human);
      }
    } else {
      console.warn("Attempted to initialize game logic but models or men array not ready.");
    }
  }
}

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
  const emoteRawName = "loopFightIdle01";

  for (const clip of gltf.animations) {
    const processedName = clip.name.replace(/^loop/i, "");
    if (/Idle|Walk|Run|Jump|Attack/i.test(processedName) || clip.name === emoteRawName) {
      map.set(processedName, mixer.clipAction(clip));
    }
  }
  controls = new CharacterControls(gorillaModel, mixer, map, orbit, camera, GORILLA_MAX_HEALTH, displayGameOverScreen);
  gorillaModel.userData.controls = controls;
  gorillaModel.userData.camera = camera;
  createGorillaHealthBarUI();
  createControlsGuideUI();
  const initialGorillaHealth = controls.getGorillaHealthState();
  (window as any).updateGorillaHealthDisplay(initialGorillaHealth.current, initialGorillaHealth.max);
  
  gorillaLoaded = true;
  tryInitializeGameLogic();
});

const mixers: THREE.AnimationMixer[] = [];
const men: THREE.Object3D[] = [];
(window as any).men = men;

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

  for (let i = 0; i < NUM_HUMANS; i++) {
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

  menLoaded = true;
  tryInitializeGameLogic();
});

const keys: Record<string, boolean> = {};
const keyHighlightMap: Record<string, string> = {
  "KeyW": "W", "KeyA": "A", "KeyS": "S", "KeyD": "D",
  "ArrowUp": "ArrowUp", "ArrowDown": "ArrowDown", "ArrowLeft": "ArrowLeft", "ArrowRight": "ArrowRight",
  "ShiftLeft": "SHIFT", "ShiftRight": "SHIFT",
  "Space": "SPACE",
  "KeyB": "B"
};

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  const highlightId = keyHighlightMap[e.code];
  if (highlightId) {
    updateKeyHighlight(highlightId, true);
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  const highlightId = keyHighlightMap[e.code];
  if (highlightId) {
    updateKeyHighlight(highlightId, false);
  }
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
let humansRemainingText: HTMLDivElement;

const GORILLA_MAX_HEALTH = 500;

function createGorillaHealthBarUI() {
  gorillaHealthBarContainer = document.createElement('div');
  gorillaHealthBarContainer.className = 'gorilla-health-bar-container';

  const hpRow = document.createElement('div');
  hpRow.className = 'hp-row';

  const label = document.createElement('span');
  label.textContent = 'GORILLA HP:';
  label.className = 'hp-label';

  const barBackground = document.createElement('div');
  barBackground.className = 'hp-bar-background';

  gorillaHealthFill = document.createElement('div');
  gorillaHealthFill.className = 'hp-bar-fill';

  gorillaHealthText = document.createElement('div');
  gorillaHealthText.className = 'hp-text';

  barBackground.appendChild(gorillaHealthFill);
  barBackground.appendChild(gorillaHealthText);
  hpRow.appendChild(label);
  hpRow.appendChild(barBackground);
  gorillaHealthBarContainer.appendChild(hpRow);

  humansRemainingText = document.createElement('div');
  humansRemainingText.className = 'humans-remaining-text';
  humansRemainingText.textContent = 'HUMANS REMAINING: ...';
  gorillaHealthBarContainer.appendChild(humansRemainingText);

  document.body.appendChild(gorillaHealthBarContainer);
}

function createControlsGuideUI() {
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls-container';

  const title = document.createElement('h3');
  title.textContent = 'Controls:';
  title.className = 'controls-title';

  const movementText = document.createElement('p');
  movementText.innerHTML = `Move: <span id="control-key-W" class="controls-key">W</span><span id="control-key-A" class="controls-key">A</span><span id="control-key-S" class="controls-key">S</span><span id="control-key-D" class="controls-key">D</span> / <span id="control-key-ArrowUp" class="controls-key">↑</span><span id="control-key-ArrowDown" class="controls-key">↓</span><span id="control-key-ArrowLeft" class="controls-key">↑</span><span id="control-key-ArrowRight" class="controls-key">↑</span>`;
  movementText.className = 'controls-text';

  const sprintText = document.createElement('p');
  sprintText.innerHTML = `Sprint: <span id="control-key-SHIFT" class="controls-key">SHIFT</span>`;
  sprintText.className = 'controls-text';

  const attackText = document.createElement('p');
  attackText.innerHTML = `Attack: <span id="control-key-SPACE" class="controls-key">SPACE</span>`;
  attackText.className = 'controls-text';

  const emoteText = document.createElement('p');
  emoteText.innerHTML = `Emote: <span id="control-key-B" class="controls-key">B</span>`;
  emoteText.className = 'controls-text';
  emoteText.style.marginBottom = "0";

  controlsContainer.appendChild(title);
  controlsContainer.appendChild(movementText);
  controlsContainer.appendChild(sprintText);
  controlsContainer.appendChild(attackText);
  controlsContainer.appendChild(emoteText);
  document.body.appendChild(controlsContainer);
}

function updateKeyHighlight(keyIdSuffix: string, isActive: boolean) {
  const keyElement = document.getElementById(`control-key-${keyIdSuffix}`) as HTMLElement;
  if (keyElement) {
    if (isActive) {
      keyElement.classList.add('active');
    } else {
      keyElement.classList.remove('active');
    }
  }
}

(window as any).updateGorillaHealthDisplay = (currentHealth: number, maxHealth: number) => {
  if (!gorillaHealthFill || !gorillaHealthText) return;

  const percentage = (currentHealth / maxHealth) * 100;
  gorillaHealthFill.style.width = percentage + '%';
  gorillaHealthText.textContent = currentHealth + '/' + maxHealth;

  gorillaHealthFill.className = 'hp-bar-fill';
  if (percentage <= 15) {
    gorillaHealthFill.classList.add('very-critical');
  } else if (percentage <= 35) {
    gorillaHealthFill.classList.add('critical');
  } else if (percentage <= 65) {
    gorillaHealthFill.classList.add('low');
  }
};

(window as any).updateHumansRemainingDisplay = (count: number) => {
  if (humansRemainingText) {
    humansRemainingText.textContent = `HUMANS REMAINING: ${count}`;
  }
};

function displayEndScreen(isVictory: boolean) {
  const container = document.createElement('div');
  container.className = 'end-screen-container';

  const messageText = document.createElement('h1');
  messageText.textContent = isVictory ? 'Victory!' : 'You Lose!';
  messageText.className = isVictory ? 'end-screen-message victory' : 'end-screen-message defeat';

  const playAgainButton = document.createElement('button');
  playAgainButton.textContent = 'Play Again';
  playAgainButton.className = isVictory ? 'end-screen-button victory' : 'end-screen-button defeat';

  playAgainButton.onclick = () => {
    window.location.reload();
  };

  container.appendChild(messageText);
  container.appendChild(playAgainButton);
  document.body.appendChild(container);
}

function displayVictoryScreen() {
  displayEndScreen(true);
}

function displayGameOverScreen() {
  displayEndScreen(false);
}

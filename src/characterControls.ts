import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { DIRECTIONS, SHIFT, SPACE } from './utils';

export class CharacterControls {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  animationsMap: Map<string, THREE.AnimationAction>;
  currentAction = 'Idle';
  isJumping = false;
  velocityY = 0;
  gravity = -9.8;
  walkVelocity = 4;
  runVelocity = 10;
  fadeDuration = 0.2;
  orbit: OrbitControls;
  camera: THREE.Camera;
  cameraTarget = new THREE.Vector3();
  walkDir = new THREE.Vector3();
  rotAngle = new THREE.Vector3(0, 1, 0);
  rotQuat = new THREE.Quaternion();

  constructor(
    model: THREE.Group,
    mixer: THREE.AnimationMixer,
    animationsMap: Map<string, THREE.AnimationAction>,
    orbit: OrbitControls,
    camera: THREE.Camera
  ) {
    this.model = model;
    this.mixer = mixer;
    this.animationsMap = animationsMap;
    this.orbit = orbit;
    this.camera = camera;
    this.model.rotation.y += Math.PI;
    this.playAnim('Idle');
    this.updateCamera(0, 0);
  }

  update(delta: number, keys: Record<string, boolean>) {
    if (keys[SPACE] && !this.isJumping) this.startJump();
    if (this.isJumping) {
      this.velocityY += this.gravity * delta;
      this.model.position.y += this.velocityY * delta;
      if (this.model.position.y <= 0) {
        this.model.position.y = 0;
        this.isJumping = false;
        this.playAnim('Idle');
      }
    }
    const moving = DIRECTIONS.some(d => keys[d]);
    const sprinting = moving && (keys[SHIFT] || keys['Shift'] || keys['ShiftLeft'] || keys['ShiftRight']);
    const nextAction = this.isJumping ? 'JumpInPlace' : moving ? (sprinting ? 'Run' : 'Walk') : 'Idle';
    if (nextAction !== this.currentAction) this.playAnim(nextAction);
    this.mixer.update(delta);
    if (moving) {
      const angleCam = Math.atan2(
        this.camera.position.x - this.model.position.x,
        this.camera.position.z - this.model.position.z
      );
      const offset = this.directionOffset(keys);
      this.rotQuat.setFromAxisAngle(this.rotAngle, angleCam + offset + Math.PI);
      this.model.quaternion.rotateTowards(this.rotQuat, 0.2);
      this.camera.getWorldDirection(this.walkDir);
      this.walkDir.y = 0;
      this.walkDir.normalize();
      this.walkDir.applyAxisAngle(this.rotAngle, offset);
      const velocity = sprinting ? this.runVelocity : this.walkVelocity;
      const dx = this.walkDir.x * velocity * delta;
      const dz = this.walkDir.z * velocity * delta;
      const candidatePos = this.model.position.clone().add(new THREE.Vector3(dx, 0, dz));
      const gorillaRadius = 0.5;
      let collision = false;
      const collidables = (window as any).men as THREE.Object3D[] || [];
      for (const m of collidables) {
        const mRadius = m.userData.collisionRadius || 1;
        if (candidatePos.distanceTo(m.position) < (gorillaRadius + mRadius)) {
          collision = true;
          break;
        }
      }
      if (!collision) {
        this.model.position.copy(candidatePos);
        this.updateCamera(dx, dz);
      }
    }
  }

  private startJump() {
    this.isJumping = true;
    this.velocityY = 4;
    const timeToApex = this.velocityY / -this.gravity;
    const totalJumpTime = 2 * timeToApex;
    const jumpAction = this.animationsMap.get('JumpInPlace');
    if (jumpAction) {
      const clipDuration = jumpAction.getClip().duration;
      jumpAction.timeScale = clipDuration / totalJumpTime;
      jumpAction.reset();
      jumpAction.setLoop(THREE.LoopOnce, 1);
      jumpAction.clampWhenFinished = true;
    }
    this.playAnim('JumpInPlace');
  }

  private playAnim(name: string) {
    const toPlay = this.animationsMap.get(name);
    const current = this.animationsMap.get(this.currentAction);
    current?.fadeOut(this.fadeDuration);
    toPlay?.reset().fadeIn(this.fadeDuration).play();
    this.currentAction = name;
  }

  private updateCamera(dx: number, dz: number) {
    this.camera.position.x += dx;
    this.camera.position.z += dz;
    this.cameraTarget.set(
      this.model.position.x,
      this.model.position.y + 1,
      this.model.position.z
    );
    this.orbit.target = this.cameraTarget;
  }

  private directionOffset(keys: Record<string, boolean>) {
    if (keys['ArrowUp'] && keys['ArrowLeft']) return Math.PI / 4;
    if (keys['ArrowUp'] && keys['ArrowRight']) return -Math.PI / 4;
    if (keys['ArrowUp']) return 0;
    if (keys['ArrowDown'] && keys['ArrowLeft']) return Math.PI * 3 / 4;
    if (keys['ArrowDown'] && keys['ArrowRight']) return -Math.PI * 3 / 4;
    if (keys['ArrowDown']) return Math.PI;
    if (keys['ArrowLeft']) return Math.PI / 2;
    if (keys['ArrowRight']) return -Math.PI / 2;
    return 0;
  }
}
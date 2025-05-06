import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { SHIFT, SPACE } from "./utils";

export class CharacterControls {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  animationsMap: Map<string, THREE.AnimationAction>;
  currentAction = "Idle";
  isJumping = false;
  velocityY = 0;
  gravity = -9.8;
  walkVelocity = 6;
  runVelocity = 12;
  fadeDuration = 0.2;

  currentRotationSpeed = 0;
  maxRotationSpeed = Math.PI;
  rotationAcceleration = Math.PI * 3;
  rotationDamping = Math.PI * 4;

  orbit: OrbitControls;
  camera: THREE.Camera;
  cameraTarget = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(0, 3, -6);

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

    this.orbit.enablePan = false;
    this.orbit.enableRotate = false;
    this.orbit.enableZoom = true;

    this.playAnim("Idle");
    this.updateCamera();
  }

  update(delta: number, keys: Record<string, boolean>) {
    let moveForward = false;
    let moveBackward = false;
    let turnLeft = false;
    let turnRight = false;

    if (keys["ArrowUp"]) moveForward = true;
    if (keys["ArrowDown"]) moveBackward = true;
    if (keys["ArrowLeft"]) turnLeft = true;
    if (keys["ArrowRight"]) turnRight = true;

    let verticalMovement = 0;
    if (keys[SPACE] && !this.isJumping) this.startJump();
    if (this.isJumping) {
      this.velocityY += this.gravity * delta;
      verticalMovement = this.velocityY * delta;
    }

    let targetRotationSpeed = 0;
    if (turnLeft) {
      targetRotationSpeed = this.maxRotationSpeed;
    }
    if (turnRight) {
      targetRotationSpeed = -this.maxRotationSpeed;
    }

    const acceleration =
      turnLeft || turnRight ? this.rotationAcceleration : this.rotationDamping;

    this.currentRotationSpeed = THREE.MathUtils.lerp(
      this.currentRotationSpeed,
      targetRotationSpeed,
      1.0 - Math.exp(-acceleration * delta)
    );

    this.model.rotation.y += this.currentRotationSpeed * delta;

    const sprinting =
      (moveForward || moveBackward) &&
      (keys[SHIFT] || keys["Shift"] || keys["ShiftLeft"] || keys["ShiftRight"]);
    const currentVelocity = sprinting ? this.runVelocity : this.walkVelocity;
    let moveDistance = 0;

    if (moveForward) {
      moveDistance = currentVelocity * delta;
    }
    if (moveBackward) {
      moveDistance = -currentVelocity * delta;
    }

    const moveVector = new THREE.Vector3(0, 0, 1);
    moveVector.applyQuaternion(this.model.quaternion);
    moveVector.normalize();
    const horizontalDeltaPosition = moveVector.multiplyScalar(moveDistance);

    const candidatePos = this.model.position.clone();
    candidatePos.add(horizontalDeltaPosition);
    candidatePos.y += verticalMovement;

    const gorillaRadius = 0.5;
    let collision = false;
    if (moveDistance !== 0) {
      const horizontalCandidatePos = this.model.position
        .clone()
        .add(horizontalDeltaPosition);
      const collidables = ((window as any).men as THREE.Object3D[]) || [];
      for (const m of collidables) {
        const mRadius = m.userData.collisionRadius || 1;
        if (
          horizontalCandidatePos.distanceTo(m.position) <
          gorillaRadius + mRadius
        ) {
          collision = true;
          break;
        }
      }
    }

    if (!collision) {
      this.model.position.x = candidatePos.x;
      this.model.position.z = candidatePos.z;
    }
    this.model.position.y = candidatePos.y;

    if (this.isJumping && this.model.position.y <= 0) {
      this.model.position.y = 0;
      this.isJumping = false;
      this.velocityY = 0;
    }

    let nextAction = "Idle";
    let timeScale = 1;
    if (this.isJumping) {
      nextAction = "JumpInPlace";
    } else if (moveForward || moveBackward) {
      nextAction = sprinting ? "Run" : "Walk";
      if (moveBackward) {
        timeScale = -1;
      }
    } else if (Math.abs(this.currentRotationSpeed) > 0.1) {
      nextAction = "Idle";
    }

    const walkAction = this.animationsMap.get("Walk");
    const runAction = this.animationsMap.get("Run");
    if (
      walkAction &&
      walkAction.timeScale !== (moveBackward && nextAction === "Walk" ? -1 : 1)
    ) {
      walkAction.timeScale = moveBackward && nextAction === "Walk" ? -1 : 1;
    }
    if (
      runAction &&
      runAction.timeScale !== (moveBackward && nextAction === "Run" ? -1 : 1)
    ) {
      runAction.timeScale = moveBackward && nextAction === "Run" ? -1 : 1;
    }

    if (nextAction !== this.currentAction) {
      this.playAnim(nextAction, timeScale);
    } else if (nextAction === "Walk" || nextAction === "Run") {
      const currentAnim = this.animationsMap.get(this.currentAction);
      if (currentAnim && currentAnim.timeScale !== timeScale) {
        currentAnim.timeScale = timeScale;
      }
    }

    this.mixer.update(delta);

    this.updateCamera();
  }

  private startJump() {
    this.isJumping = true;
    this.velocityY = 4;
    const jumpAction = this.animationsMap.get("JumpInPlace");
    if (jumpAction) {
      jumpAction.timeScale = 1;
      jumpAction.reset();
      jumpAction.setLoop(THREE.LoopOnce, 1);
      jumpAction.clampWhenFinished = true;
    }
    this.playAnim("JumpInPlace");
  }

  private playAnim(name: string, timeScale: number = 1) {
    const toPlay = this.animationsMap.get(name);
    const current = this.animationsMap.get(this.currentAction);

    if (current && current !== toPlay) {
      current.fadeOut(this.fadeDuration);
    }

    if (toPlay) {
      toPlay.timeScale = timeScale;
      if (!toPlay.isRunning() || name !== this.currentAction) {
        toPlay.reset();
      }
      toPlay.fadeIn(this.fadeDuration).play();
    } else {
      console.warn(`Animation "${name}" not found!`);
    }
    this.currentAction = name;
  }

  private updateCamera() {
    this.cameraTarget.set(
      this.model.position.x,
      this.model.position.y + 1.5,
      this.model.position.z
    );

    const desiredOffsetDirection = this.cameraOffset.clone().normalize();
    desiredOffsetDirection.applyQuaternion(this.model.quaternion);

    const currentDistance = this.camera.position.distanceTo(this.orbit.target);

    const desiredPosition = this.cameraTarget
      .clone()
      .add(desiredOffsetDirection.multiplyScalar(currentDistance));

    this.camera.position.copy(desiredPosition);

    this.orbit.target.copy(this.cameraTarget);

    this.orbit.update();
  }
}

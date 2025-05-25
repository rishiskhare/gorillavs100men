import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { SHIFT, SPACE } from "./utils";

declare global {
  interface Window {
    updateGorillaHealthDisplay: (currentHealth: number, maxHealth: number) => void;
  }
}

export class CharacterControls {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  animationsMap: Map<string, THREE.AnimationAction>;
  currentAction = "Idle";
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

  private isAttacking = false;
  private humanRef: any | null = null;
  private attackRadius = 5;
  private maxDamage = 100;
  private minDistanceForMaxDamage = 1;
  private frontalConeAngleForMaxDamage = Math.PI / 3;
  private initialPushbackSpeed = 5;

  maxGorillaHealth: number;
  currentGorillaHealth: number;
  private onGorillaDefeated?: () => void;
  private hasBeenDefeated: boolean = false;

  private isEmoting: boolean = false;
  private previousActionBeforeEmote: string = "Idle";
  private emoteAnimationName: string = "FightIdle01";
  private emoteFinishListener: any = null;

  constructor(
    model: THREE.Group,
    mixer: THREE.AnimationMixer,
    animationsMap: Map<string, THREE.AnimationAction>,
    orbit: OrbitControls,
    camera: THREE.Camera,
    initialMaxHealth: number = 500,
    onGorillaDefeatedCallback?: () => void
  ) {
    this.model = model;
    this.mixer = mixer;
    this.animationsMap = animationsMap;
    this.orbit = orbit;
    this.camera = camera;

    this.maxGorillaHealth = initialMaxHealth;
    this.currentGorillaHealth = initialMaxHealth;
    this.onGorillaDefeated = onGorillaDefeatedCallback;
    this.model.userData.controls = this;

    this.orbit.enablePan = false;
    this.orbit.enableRotate = false;
    this.orbit.enableZoom = true;

    this.playAnim("Idle");
    this.updateCamera();
  }

  public takeGorillaDamage(amount: number) {
    if (this.hasBeenDefeated) return;

    this.currentGorillaHealth = Math.max(0, this.currentGorillaHealth - amount);
    if (window.updateGorillaHealthDisplay) {
      window.updateGorillaHealthDisplay(this.currentGorillaHealth, this.maxGorillaHealth);
    }

    if (this.currentGorillaHealth <= 0 && !this.hasBeenDefeated) {
      this.hasBeenDefeated = true;
      if (this.onGorillaDefeated) {
        this.onGorillaDefeated();
      }
    }
  }

  public getGorillaHealthState(): { current: number, max: number } {
    return { current: this.currentGorillaHealth, max: this.maxGorillaHealth };
  }

  public setHumanRef(humanInstance: any) {
    this.humanRef = humanInstance;
  }

  update(delta: number, keys: Record<string, boolean>) {
    const tryingToAttack = keys[SPACE];
    const tryingToEmote = keys["KeyB"];
    const tryingToMove = keys["ArrowUp"] || keys["KeyW"] || keys["ArrowDown"] || keys["KeyS"] || keys["ArrowLeft"] || keys["KeyA"] || keys["ArrowRight"] || keys["KeyD"];

    if (this.isEmoting) {
      if (tryingToAttack || tryingToEmote || tryingToMove) {
        if (this.emoteFinishListener) {
          this.mixer.removeEventListener('finished', this.emoteFinishListener);
          this.emoteFinishListener = null;
        }
        this.isEmoting = false;
      } else {
        this.mixer.update(delta);
        return;
      }
    }

    if (tryingToEmote && !this.isAttacking && !this.isEmoting) {
      const emoteAction = this.animationsMap.get(this.emoteAnimationName);
      if (emoteAction) {
        this.isEmoting = true;
        this.previousActionBeforeEmote = this.currentAction;
        const currentAnim = this.animationsMap.get(this.currentAction);
        if (currentAnim && currentAnim.isRunning() && currentAnim !== emoteAction) {
            currentAnim.fadeOut(this.fadeDuration);
        }

        emoteAction.reset();
        emoteAction.setLoop(THREE.LoopOnce, 1);
        emoteAction.clampWhenFinished = true;
        emoteAction.timeScale = 1.5;
        emoteAction.fadeIn(this.fadeDuration).play();
        this.currentAction = this.emoteAnimationName;

        this.emoteFinishListener = (event: any) => {
          if (event.action === emoteAction) {
            this.mixer.removeEventListener('finished', this.emoteFinishListener!);
            this.emoteFinishListener = null;
            this.isEmoting = false;
            const actionToRevert = this.animationsMap.has(this.previousActionBeforeEmote) && this.previousActionBeforeEmote !== this.emoteAnimationName
                                   ? this.previousActionBeforeEmote
                                   : "Idle";
            this.playAnim(actionToRevert);
          }
        };
        this.mixer.addEventListener('finished', this.emoteFinishListener);

        this.mixer.update(delta);
        return;
      } else {
        console.warn(`Emote animation "${this.emoteAnimationName}" not found!`);
      }
    }

    if (tryingToAttack && !this.isAttacking && !this.isEmoting) {
      const attackAction = this.animationsMap.get("AttackComboInPlace");

      if (attackAction) {
        const clipDuration = attackAction.getClip().duration;

        this.playAnim("AttackComboInPlace", 1.5);

        if (clipDuration > 0) {
          const damageDelay = clipDuration * 0.4 / 1.5 * 1000;

          setTimeout(() => {
            if (this.humanRef && this.humanRef.men && this.humanRef.men.length > 0 && this.isAttacking) {
              this.humanRef.men.forEach((man: THREE.Object3D) => {
                if (man.userData.healthBar && !man.userData.healthBar.isDead) {
                  const directionToMan = new THREE.Vector3().subVectors(man.position, this.model.position);
                  const distanceToMan = directionToMan.length();

                  if (distanceToMan <= this.attackRadius) {
                    let damageAmount = 0;
                    const forward = new THREE.Vector3(0, 0, 1);
                    forward.applyQuaternion(this.model.quaternion);
                    forward.y = 0;
                    forward.normalize();

                    const directionToManHorizontal = directionToMan.clone();
                    directionToManHorizontal.y = 0;
                    directionToManHorizontal.normalize();

                    const angleToMan = forward.angleTo(directionToManHorizontal);
                    const isVeryClose = distanceToMan <= this.minDistanceForMaxDamage;
                    const isDirectlyInFront = angleToMan <= this.frontalConeAngleForMaxDamage / 2;

                    if (isVeryClose && isDirectlyInFront) {
                      damageAmount = this.maxDamage;
                    } else {
                      damageAmount = this.maxDamage * (1 - (distanceToMan / this.attackRadius));
                    }
                    damageAmount = Math.max(0, damageAmount);

                    if (damageAmount > 0) {
                      this.humanRef.takeDamage(man, damageAmount);

                      if (!man.userData.isBeingPushedBack) {
                        const pushbackDirection = new THREE.Vector3().subVectors(man.position, this.model.position);
                        pushbackDirection.y = 0;
                        pushbackDirection.normalize();
                        man.userData.pushbackVelocity = pushbackDirection.multiplyScalar(this.initialPushbackSpeed);
                        man.userData.isBeingPushedBack = true;
                      }
                    }
                  }
                }
              });
            }
          }, damageDelay);
        }
      } else {
        console.warn("AttackComboInPlace animation not found!");
      }
    }

    let moveForward = false;
    let moveBackward = false;
    let turnLeft = false;
    let turnRight = false;

    if (keys["ArrowUp"] || keys["KeyW"]) moveForward = true;
    if (keys["ArrowDown"] || keys["KeyS"]) moveBackward = true;
    if (keys["ArrowLeft"] || keys["KeyA"]) turnLeft = true;
    if (keys["ArrowRight"] || keys["KeyD"]) turnRight = true;

    let targetRotationSpeed = 0;
    if (turnLeft) targetRotationSpeed = this.maxRotationSpeed;
    if (turnRight) targetRotationSpeed = -this.maxRotationSpeed;

    const rotationAccelerationToUse = turnLeft || turnRight ? this.rotationAcceleration : this.rotationDamping;
    this.currentRotationSpeed = THREE.MathUtils.lerp(
      this.currentRotationSpeed,
      targetRotationSpeed,
      1.0 - Math.exp(-rotationAccelerationToUse * delta)
    );
    this.model.rotation.y += this.currentRotationSpeed * delta;

    const sprinting = (moveForward || moveBackward) && (keys[SHIFT] || keys["Shift"] || keys["ShiftLeft"] || keys["ShiftRight"]);
    const currentVelocity = sprinting ? this.runVelocity : this.walkVelocity;
    let moveDistance = 0;
    if (moveForward) moveDistance = currentVelocity * delta;
    if (moveBackward) moveDistance = -currentVelocity * delta;

    if (moveDistance !== 0 && !this.isEmoting) {
        const moveVector = new THREE.Vector3(0, 0, 1);
        moveVector.applyQuaternion(this.model.quaternion);
        moveVector.normalize();
        const horizontalDeltaPosition = moveVector.multiplyScalar(moveDistance);
        const candidatePos = this.model.position.clone();
        candidatePos.add(horizontalDeltaPosition);
        this.model.position.copy(candidatePos);
    }

    if (!this.isAttacking && !this.isEmoting) {
      let desiredLocomotionAction = "Idle";
      let newTimeScale = 1;

      if (moveForward || moveBackward) {
        desiredLocomotionAction = sprinting ? "Run" : "Walk";
        const baseSpeed = 1.25;
        newTimeScale = moveBackward ? -baseSpeed : baseSpeed;
      } else {
        newTimeScale = 1;
      }

      const currentAnim = this.animationsMap.get(this.currentAction);
      if (this.currentAction !== desiredLocomotionAction ||
          (currentAnim && (desiredLocomotionAction === "Walk" || desiredLocomotionAction === "Run") && currentAnim.timeScale !== newTimeScale)
         ) {
        this.playAnim(desiredLocomotionAction, newTimeScale);
      }
    }

    this.mixer.update(delta);
    this.updateCamera();
  }

  private playAnim(name: string, timeScale: number = 1) {
    const toPlay = this.animationsMap.get(name);
    const current = this.animationsMap.get(this.currentAction);

    if (this.isEmoting && name !== this.emoteAnimationName) {

    } else if (this.isEmoting) {

    } else if (current && current !== toPlay) {
      current.fadeOut(this.fadeDuration);
    }

    if (toPlay) {
      toPlay.timeScale = timeScale;
      if (!toPlay.isRunning() || name !== this.currentAction) {
        toPlay.reset();
      }

      if (name === "AttackComboInPlace") {
        this.isAttacking = true;
        toPlay.setLoop(THREE.LoopOnce, 1);
        toPlay.clampWhenFinished = true;
        toPlay.fadeIn(this.fadeDuration).play();

        const listener = (event: any) => {
          if (event.action === toPlay) {
            this.mixer.removeEventListener('finished', listener);
            this.isAttacking = false;
            if (this.currentAction === "AttackComboInPlace") {
                this.playAnim("Idle");
            }
          }
        };
        this.mixer.addEventListener('finished', listener);
      } else if (name === this.emoteAnimationName) {
        toPlay.reset();
        toPlay.setLoop(THREE.LoopOnce, 1);
        toPlay.clampWhenFinished = true;
        toPlay.timeScale = timeScale;
        toPlay.fadeIn(this.fadeDuration).play();
      } else {
        toPlay.setLoop(THREE.LoopRepeat, Infinity);
        toPlay.clampWhenFinished = false;
        toPlay.fadeIn(this.fadeDuration).play();
      }
      this.currentAction = name;
    } else {
      console.warn(`Animation "${name}" not found! Falling back to Idle.`);
      if (name === "AttackComboInPlace") {
        this.isAttacking = false;
      }
      if (this.currentAction !== "Idle") {
          this.playAnim("Idle");
      }
    }
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
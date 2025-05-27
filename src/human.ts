import * as THREE from "three";
import { HealthBar } from "./healthBar";
import { CharacterControls } from "./characterControls";

const MAX_HUMAN_HEALTH = 100;
const HUMAN_SPEED = 1.5;
const CHASE_RADIUS = 15;
const FADE_OUT_DURATION = 0.5;

const HUMAN_ATTACK_RANGE = 1.8;
const HUMAN_ATTACK_DAMAGE = 5;
const HUMAN_ATTACK_COOLDOWN_TIME = 1.5;
const HUMAN_ATTACK_ANIM_HIT_POINT = 0.6;

const PUSHBACK_DAMPING = 0.9;
const MIN_PUSHBACK_SPEED_THRESHOLD = 0.1;

const POSSIBLE_HUMAN_ATTACK_ANIMATIONS = [
    "Punch_Right", "Punch_Left", "Kick_Right", "Kick_Left"
];

const HIT_REACTION_ANIMATION_NAME = "HitRecieve_2";
const HIT_REACTION_BACKWARD_SPEED = 2.0;

const HUMAN_ANIMATION_FADE_DURATION = 0.2;

const ANIMATION_UPDATE_DISTANCE_THRESHOLD_SQUARED = 40 * 40;
const ANIMATION_UPDATE_THROTTLE_FACTOR = 3;

const SHADOW_CASTING_DISTANCE_THRESHOLD_SQUARED = 35 * 35;

type DyingHumanState = {
    fadeTimer: number;
    processingState: 'pending' | 'animating' | 'fading';
    animationUpdateCounter: number;
    isCastingShadow: boolean;
};

export class Human {
  private men: THREE.Object3D[];
  private gorilla: THREE.Object3D;
  private activeHumans: Map<THREE.Object3D, HealthBar> = new Map();
  private scene: THREE.Scene | null = null;
  private dyingHumans: Map<THREE.Object3D, DyingHumanState> = new Map();
  private onAllHumansDefeated?: () => void;
  private initialNumHumans: number = 0;

  constructor(men: THREE.Object3D[], gorilla: THREE.Object3D, onAllHumansDefeatedCallback?: () => void) {
    this.men = men;
    this.gorilla = gorilla;
    this.onAllHumansDefeated = onAllHumansDefeatedCallback;
    this.initialNumHumans = men.length;

    if (this.men.length > 0 && this.men[0].parent) {
        this.scene = this.men[0].parent as THREE.Scene;
    }

    this.men.forEach(man => {
        if (this.scene) {
            const healthBar = new HealthBar(MAX_HUMAN_HEALTH, MAX_HUMAN_HEALTH);
            man.userData.healthBar = healthBar;
            man.userData.currentHealth = MAX_HUMAN_HEALTH;
            man.userData.maxHealth = MAX_HUMAN_HEALTH;
            man.userData.isDying = false;
            man.userData.isAttacking = false;
            man.userData.currentAttackAnimation = null;
            man.userData.attackAnimationCooldown = 0;
            man.userData.humanAttackAnimationNames = [];
            man.userData.isBeingPushedBack = false;
            man.userData.pushbackVelocity = new THREE.Vector3();
            man.userData.isHitReacting = false;
            man.userData.hitReactionMovementDirection = new THREE.Vector3();
            man.userData.animationUpdateCounter = 0;
            man.userData.isCastingShadow = false;

            const actions = man.userData.actions as Map<string, THREE.AnimationAction> | undefined;
            if (actions) {
                POSSIBLE_HUMAN_ATTACK_ANIMATIONS.forEach(animName => {
                    if (actions.has(animName)) {
                        man.userData.humanAttackAnimationNames.push(animName);
                    }
                });
            }

            this.scene.add(healthBar.sprite);
            this.activeHumans.set(man, healthBar);
        }
    });

    if (typeof (window as any).updateHumansRemainingDisplay === 'function') {
      (window as any).updateHumansRemainingDisplay(this.activeHumans.size);
    }
  }

  public takeDamage(man: THREE.Object3D, amount: number, attackerPosition?: THREE.Vector3) {
    if (!this.activeHumans.has(man) || man.userData.isDying || man.userData.isHitReacting) return;
    const healthBar = man.userData.healthBar as HealthBar;

    man.userData.currentHealth -= amount;
    healthBar.updateHealth(man.userData.currentHealth);

    if (healthBar.isDead && !man.userData.isDying) {
        this.handleDeath(man);
    } else if (!healthBar.isDead && attackerPosition) {
        man.userData.isHitReacting = true;
        man.userData.isAttacking = false;
        man.userData.attackAnimationCooldown = 0;

        const backwardDirection = new THREE.Vector3().subVectors(man.position, attackerPosition);
        backwardDirection.y = 0;
        backwardDirection.normalize();
        man.userData.hitReactionMovementDirection = backwardDirection;

        const actions = man.userData.actions as Map<string, THREE.AnimationAction>; 
        const hitReactionAnim = actions.get(HIT_REACTION_ANIMATION_NAME);
        const currentActionName = man.userData.currentAction as string | null;
        const currentMainAction = currentActionName ? actions.get(currentActionName) : null;

        if (currentMainAction && currentMainAction !== hitReactionAnim) {
            currentMainAction.fadeOut(HUMAN_ANIMATION_FADE_DURATION);
        }

        if (hitReactionAnim) {
            hitReactionAnim.reset();
            hitReactionAnim.setLoop(THREE.LoopOnce, 1);
            hitReactionAnim.clampWhenFinished = true;
            hitReactionAnim.fadeIn(HUMAN_ANIMATION_FADE_DURATION).play();
            man.userData.currentAction = HIT_REACTION_ANIMATION_NAME;

            const mixer = man.userData.mixer as THREE.AnimationMixer;
            const onHitReactionFinished = (event: any) => {
                if (event.action === hitReactionAnim && event.target === mixer) {
                    man.userData.isHitReacting = false;
                    hitReactionAnim.fadeOut(HUMAN_ANIMATION_FADE_DURATION);
                    mixer.removeEventListener('finished', onHitReactionFinished);
                }
            };
            mixer.addEventListener('finished', onHitReactionFinished);
        } else {
            man.userData.isHitReacting = false; 
        }
    }
  }

  private handleDeath(man: THREE.Object3D) {
    man.userData.isDying = true;
    this.dyingHumans.set(man, { 
        fadeTimer: FADE_OUT_DURATION, 
        processingState: 'pending',
        animationUpdateCounter: 0,
        isCastingShadow: false
    });

    const healthBar = this.activeHumans.get(man);
    if (healthBar) {
        if (this.scene) {
            this.scene.remove(healthBar.sprite);
        }
        healthBar.dispose();
    }
    const actions = man.userData.actions as Map<string, THREE.AnimationAction>; 
    const currentActionName = man.userData.currentAction as string | null;
    if (currentActionName && currentActionName !== "Death") { 
        const currentMainAction = actions.get(currentActionName); 
        currentMainAction?.stop(); 
    } 
    man.userData.currentAction = null;
  }

  private prepareMaterialsForFading(man: THREE.Object3D) {
    man.traverse((child: any) => {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material = child.material.map((mat: THREE.Material) => {
                    const clonedMat = mat.clone();
                    clonedMat.transparent = true;
                    clonedMat.needsUpdate = true; 
                    return clonedMat;
                });
            } else {
                const matToClone = child.material as THREE.Material;
                const clonedMat = matToClone.clone();
                clonedMat.transparent = true;
                clonedMat.needsUpdate = true; 
                child.material = clonedMat;
            }
        }
    });
  }

  update(delta: number) {
    if (!this.gorilla || !this.gorilla.userData.camera) return;
    const gorillaPosition = this.gorilla.position;
    const cameraPosition = this.gorilla.userData.camera.position;
    const gorillaControls = this.gorilla.userData.controls as CharacterControls | undefined;

    this.activeHumans.forEach((healthBar, man) => {
      if (man.userData.isDying) return;

      const distanceToCameraSquaredForShadows = man.position.distanceToSquared(cameraPosition);
      if (distanceToCameraSquaredForShadows < SHADOW_CASTING_DISTANCE_THRESHOLD_SQUARED) {
        if (!man.userData.isCastingShadow) {
          man.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true;
            }
          });
          man.userData.isCastingShadow = true;
        }
      } else {
        if (man.userData.isCastingShadow) {
          man.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = false;
            }
          });
          man.userData.isCastingShadow = false;
        }
      }

      if (man.userData.isHitReacting) {
        const mixer = man.userData.mixer as THREE.AnimationMixer;
        if (mixer) mixer.update(delta);

        const moveDelta = man.userData.hitReactionMovementDirection.clone().multiplyScalar(HIT_REACTION_BACKWARD_SPEED * delta);
        man.position.add(moveDelta);

        const manPositionForHealthBar = man.position;
        healthBar.setPosition(manPositionForHealthBar.x, manPositionForHealthBar.y + man.scale.y * 0.8, manPositionForHealthBar.z);
        if (this.gorilla.userData.camera) {
          healthBar.sprite.lookAt(this.gorilla.userData.camera.position);
        }
        return;
      }

      if (man.userData.isBeingPushedBack) {
        man.position.add(man.userData.pushbackVelocity.clone().multiplyScalar(delta));
        man.userData.pushbackVelocity.multiplyScalar(PUSHBACK_DAMPING);

        if (man.userData.pushbackVelocity.length() < MIN_PUSHBACK_SPEED_THRESHOLD) {
          man.userData.isBeingPushedBack = false;
          man.userData.pushbackVelocity.set(0, 0, 0);
        }
        
        const manPositionForHealthBar = man.position;
        healthBar.setPosition(manPositionForHealthBar.x, manPositionForHealthBar.y + man.scale.y * 0.8, manPositionForHealthBar.z);
        if (this.gorilla.userData.camera) {
          healthBar.sprite.lookAt(this.gorilla.userData.camera.position);
        }
        const mixer = man.userData.mixer as THREE.AnimationMixer;
        if (mixer) mixer.update(delta);
        return;
      }

      if (man.userData.attackAnimationCooldown > 0) {
        man.userData.attackAnimationCooldown -= delta;
      }

      const mixer = man.userData.mixer as THREE.AnimationMixer;
      const actions = man.userData.actions as Map<string, THREE.AnimationAction>;      

      if (man.userData.isAttacking) {
        if (mixer) mixer.update(delta);
        return; 
      }

      const manPosition = man.position;
      const directionToGorilla = new THREE.Vector3().subVectors(gorillaPosition, manPosition);
      const distanceToGorilla = directionToGorilla.length();

      healthBar.setPosition(manPosition.x, manPosition.y + man.scale.y * 0.8, manPosition.z);
      if (this.gorilla.userData.camera) {
        healthBar.sprite.lookAt(this.gorilla.userData.camera.position);
      }
      
      const currentActionName = man.userData.currentAction as string | null;
      let desiredActionName: string | null = null;
      let performMovement = false;

      const gorillaHasMoved = gorillaControls ? gorillaControls.hasGorillaMovedInitially : false;

      if (!man.userData.isAttacking) {
        man.lookAt(gorillaPosition.x, man.position.y, gorillaPosition.z);
      }

      if (distanceToGorilla <= HUMAN_ATTACK_RANGE) {
        if (man.userData.attackAnimationCooldown <= 0 && 
            man.userData.humanAttackAnimationNames && 
            man.userData.humanAttackAnimationNames.length > 0
           ) {
            man.userData.isAttacking = true;
            const attackAnimNames = man.userData.humanAttackAnimationNames as string[];
            const selectedAnimName = attackAnimNames[Math.floor(Math.random() * attackAnimNames.length)];
            man.userData.currentAttackAnimation = selectedAnimName;
            
            const currentAnimAction = currentActionName ? actions.get(currentActionName) : null;
            if (currentAnimAction) currentAnimAction.stop();

            const attackAction = actions.get(selectedAnimName);
            if (attackAction) {
                if (currentAnimAction && currentAnimAction !== attackAction) {
                    currentAnimAction.fadeOut(HUMAN_ANIMATION_FADE_DURATION);
                }
                attackAction.reset();
                attackAction.setLoop(THREE.LoopOnce, 1);
                attackAction.clampWhenFinished = true;
                attackAction.timeScale = 1;
                attackAction.fadeIn(HUMAN_ANIMATION_FADE_DURATION).play();
                man.userData.currentAction = selectedAnimName;

                const animDuration = attackAction.getClip().duration;
                const damageTime = animDuration * HUMAN_ATTACK_ANIM_HIT_POINT * 1000; 

                setTimeout(() => {
                    if (man.userData.isAttacking && 
                        man.userData.currentAttackAnimation === selectedAnimName && 
                        this.activeHumans.has(man) && 
                        !man.userData.isDying && 
                        gorillaControls) {
                        gorillaControls.takeGorillaDamage(HUMAN_ATTACK_DAMAGE);
                    }
                }, damageTime);

                const onAttackFinished = (event: any) => {
                    if (event.action === attackAction && event.target === mixer) {
                        man.userData.isAttacking = false;
                        man.userData.currentAttackAnimation = null;
                        man.userData.attackAnimationCooldown = HUMAN_ATTACK_COOLDOWN_TIME;
                        mixer.removeEventListener('finished', onAttackFinished);
                    }
                };
                mixer.addEventListener('finished', onAttackFinished);
            }
            desiredActionName = selectedAnimName;
        } else {
            desiredActionName = "Idle";
        }
        performMovement = false;

      } else if (distanceToGorilla < CHASE_RADIUS && gorillaHasMoved) {
        desiredActionName = "Run";
        performMovement = true;

      } else {
        desiredActionName = "Idle";
        performMovement = false;
      }

      if (performMovement && !man.userData.isAttacking) {
        directionToGorilla.normalize();
        man.position.add(directionToGorilla.multiplyScalar(HUMAN_SPEED * delta));
      }

      if (desiredActionName && desiredActionName !== currentActionName && !man.userData.isAttacking) {
          const currentAnim = currentActionName ? actions.get(currentActionName) : null;
          
          const newAnim = actions.get(desiredActionName);
          if (newAnim) {
              if (currentAnim && currentAnim !== newAnim) {
                  currentAnim.fadeOut(HUMAN_ANIMATION_FADE_DURATION);
              }
              newAnim.reset();
              if (desiredActionName === "Run") {
                  newAnim.timeScale = 1.0;
              } else {
                  newAnim.timeScale = 1.0;
              }
              newAnim.fadeIn(HUMAN_ANIMATION_FADE_DURATION).play();
              man.userData.currentAction = desiredActionName;
          }
      }

      const distanceToCameraSquared = man.position.distanceToSquared(cameraPosition);
      let updateMixerThisFrame = true;

      if (distanceToCameraSquared > ANIMATION_UPDATE_DISTANCE_THRESHOLD_SQUARED) {
        man.userData.animationUpdateCounter = (man.userData.animationUpdateCounter + 1) % ANIMATION_UPDATE_THROTTLE_FACTOR;
        if (man.userData.animationUpdateCounter !== 0) {
          updateMixerThisFrame = false;
        }
      }

      if (mixer && updateMixerThisFrame) {
          mixer.update(delta);
      }
    });

    const humansToRemove: THREE.Object3D[] = [];
    this.dyingHumans.forEach((state, man) => {
        const mixer = man.userData.mixer as THREE.AnimationMixer;
        const actions = man.userData.actions as Map<string, THREE.AnimationAction>;
        const deathAction = actions.get("Death");

        switch (state.processingState) {
            case 'pending':
                const currentActionName = man.userData.currentAction as string | null;
                if (currentActionName && currentActionName !== "Death") {
                    const currentMainAction = actions.get(currentActionName);
                    currentMainAction?.fadeOut(HUMAN_ANIMATION_FADE_DURATION);
                }

                if (deathAction) {
                    deathAction.reset();
                    deathAction.setLoop(THREE.LoopOnce, 1);
                    deathAction.clampWhenFinished = true;
                    deathAction.fadeIn(HUMAN_ANIMATION_FADE_DURATION).play();
                    man.userData.currentAction = "Death";
                    state.processingState = 'animating';
                } else {
                    this.prepareMaterialsForFading(man);
                    state.processingState = 'fading';
                }
                break;

            case 'animating':
                if (deathAction && deathAction.isRunning()) {
                    if (mixer) mixer.update(delta);
                } else {
                    this.prepareMaterialsForFading(man);
                    state.processingState = 'fading';
                }
                break;

            case 'fading':
                state.fadeTimer -= delta;
                const opacity = Math.max(0, state.fadeTimer / FADE_OUT_DURATION);

                man.traverse((child: any) => {
                    if (child.isMesh && child.material) {
                        const materialsToProcess: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
                        materialsToProcess.forEach((material: THREE.Material) => {
                            material.opacity = opacity;
                        });
                    }
                });

                if (state.fadeTimer <= 0) {
                    humansToRemove.push(man);
                }
                break;
        }
    });

    humansToRemove.forEach(man => {
        if (this.scene) this.scene.remove(man);
        this.activeHumans.delete(man);
        this.dyingHumans.delete(man);
        man.userData.isCastingShadow = false;
        const index = this.men.indexOf(man);
        if (index > -1) this.men.splice(index, 1);
        man.traverse((object: any) => {
            if (object.isMesh) {
                object.geometry.dispose();
                if (object.material) {
                    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach((material: THREE.Material) => {
                        Object.keys(material).forEach(key => {
                            const value = (material as any)[key];
                            if (value && typeof value.dispose === 'function') {
                                value.dispose();
                            }
                        });
                    });
                }
            }
        });
    });

    if (typeof (window as any).updateHumansRemainingDisplay === 'function') {
      (window as any).updateHumansRemainingDisplay(this.activeHumans.size);
    }

    if (this.initialNumHumans > 0 && this.activeHumans.size === 0 && this.dyingHumans.size === 0 && this.men.length === 0 && this.onAllHumansDefeated) {
        this.onAllHumansDefeated();
        this.initialNumHumans = 0;
    }
  }
}

import * as THREE from "three";
import { HealthBar } from "./healthBar";
import { CharacterControls } from "./characterControls";

const MAX_HUMAN_HEALTH = 100;
const HUMAN_SPEED = 1.5;
const CHASE_RADIUS = 30;
const FADE_OUT_DURATION = 1.0;

const HUMAN_ATTACK_RANGE = 1.8;
const HUMAN_ATTACK_DAMAGE = 10;
const HUMAN_ATTACK_COOLDOWN_TIME = 1.5;
const HUMAN_ATTACK_ANIM_HIT_POINT = 0.6;

const POSSIBLE_HUMAN_ATTACK_ANIMATIONS = [
    "Punch_Right", "Punch_Left", "Kick_Right", "Kick_Left"
];

type DyingHumanState = { 
    fadeTimer: number; 
    processingState: 'pending' | 'animating' | 'fading';
};

export class Human {
  private men: THREE.Object3D[];
  private gorilla: THREE.Object3D;
  private activeHumans: Map<THREE.Object3D, HealthBar> = new Map();
  private scene: THREE.Scene | null = null;
  private dyingHumans: Map<THREE.Object3D, DyingHumanState> = new Map();

  constructor(men: THREE.Object3D[], gorilla: THREE.Object3D) {
    this.men = men;
    this.gorilla = gorilla;

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
  }

  public takeDamage(man: THREE.Object3D, amount: number) {
    if (!this.activeHumans.has(man) || man.userData.isDying) return;
    const healthBar = man.userData.healthBar as HealthBar;

    man.userData.currentHealth -= amount;
    healthBar.updateHealth(man.userData.currentHealth);

    if (healthBar.isDead && !man.userData.isDying) {
        this.handleDeath(man);
    }
  }

  private handleDeath(man: THREE.Object3D) {
    man.userData.isDying = true;
    this.dyingHumans.set(man, { 
        fadeTimer: FADE_OUT_DURATION, 
        processingState: 'pending' 
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
    if (!this.gorilla) return;
    const gorillaPosition = this.gorilla.position;
    const gorillaControls = this.gorilla.userData.controls as CharacterControls | undefined;

    this.activeHumans.forEach((healthBar, man) => {
      if (man.userData.isDying) return;

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

      if (distanceToGorilla <= HUMAN_ATTACK_RANGE) {
        man.lookAt(gorillaPosition.x, man.position.y, gorillaPosition.z);

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
                attackAction.reset();
                attackAction.setLoop(THREE.LoopOnce, 1);
                attackAction.clampWhenFinished = true;
                attackAction.play();
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

      } else if (distanceToGorilla < CHASE_RADIUS) {
        man.lookAt(gorillaPosition.x, man.position.y, gorillaPosition.z);
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
          if (currentAnim) currentAnim.stop(); 
          
          const newAnim = actions.get(desiredActionName);
          if (newAnim) {
              newAnim.reset().play();
              man.userData.currentAction = desiredActionName;
          }
      }
      if (mixer) mixer.update(delta);
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
                    currentMainAction?.stop();
                }

                if (deathAction) {
                    deathAction.reset();
                    deathAction.setLoop(THREE.LoopOnce, 1);
                    deathAction.clampWhenFinished = true;
                    deathAction.play();
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
  }
}

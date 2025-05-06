import * as THREE from "three";

export class Human {
  private men: THREE.Object3D[];
  private gorilla: THREE.Object3D;
  private runSpeed = 4;

  constructor(men: THREE.Object3D[], gorilla: THREE.Object3D) {
    this.men = men;
    this.gorilla = gorilla;
    this.men.forEach((man) => this.playAnimation(man, "Run"));
  }

  private playAnimation(man: THREE.Object3D, animationName: string) {
    const mixer = man.userData.mixer as THREE.AnimationMixer | undefined;
    const actions = man.userData.actions as
      | Map<string, THREE.AnimationAction>
      | undefined;
    const currentActionName = man.userData.currentAction as string | undefined;

    if (!mixer || !actions) return;

    const actionToPlay = actions.get(animationName);
    const currentAction = currentActionName
      ? actions.get(currentActionName)
      : undefined;

    if (!actionToPlay) {
      console.warn(`Animation "${animationName}" not found for man.`);
      return;
    }

    if (currentAction && currentAction !== actionToPlay) {
      currentAction.fadeOut(0.2);
    }

    actionToPlay.reset();
    actionToPlay.timeScale = 1;
    actionToPlay.fadeIn(0.2).play();
    man.userData.currentAction = animationName;
  }

  update(delta: number) {
    if (!this.gorilla) return;

    const gorillaPosition = this.gorilla.position;
    const direction = new THREE.Vector3();
    const lookAtPosition = new THREE.Vector3();

    this.men.forEach((man) => {
      const manPosition = man.position;
      direction.subVectors(gorillaPosition, manPosition);

      direction.x += (Math.random() - 0.5) * 0.1;
      direction.z += (Math.random() - 0.5) * 0.1;
      direction.y = 0;
      direction.normalize();

      const moveDistance = this.runSpeed * delta;
      man.position.addScaledVector(direction, moveDistance);

      lookAtPosition.set(gorillaPosition.x, manPosition.y, gorillaPosition.z);
      man.lookAt(lookAtPosition);

      if (man.userData.currentAction !== "Run") {
        this.playAnimation(man, "Run");
      }

      const mixer = man.userData.mixer as THREE.AnimationMixer | undefined;
      if (mixer) {
        mixer.update(delta);
      }
    });
  }
}

import * as THREE from 'three';

const HEALTHBAR_WIDTH = 100;
const HEALTHBAR_HEIGHT = 10;
const HEALTHBAR_Y_OFFSET = 1.5;

export class HealthBar {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;
    sprite: THREE.Sprite;
    private maxHealth: number;
    private currentHealth: number;

    constructor(maxHealth: number, initialHealth: number) {
        this.maxHealth = maxHealth;
        this.currentHealth = initialHealth;

        this.canvas = document.createElement('canvas');
        this.canvas.width = HEALTHBAR_WIDTH;
        this.canvas.height = HEALTHBAR_HEIGHT;
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get 2D context for health bar');
        }
        this.context = context;

        this.texture = new THREE.CanvasTexture(this.canvas);
        const material = new THREE.SpriteMaterial({ map: this.texture });
        this.sprite = new THREE.Sprite(material);
        this.sprite.scale.set(1, HEALTHBAR_HEIGHT / HEALTHBAR_WIDTH, 1.0);

        this.updateHealthBar();
    }

    updateHealth(newHealth: number) {
        this.currentHealth = Math.max(0, Math.min(this.maxHealth, newHealth));
        this.updateHealthBar();
    }

    private updateHealthBar() {
        this.context.clearRect(0, 0, HEALTHBAR_WIDTH, HEALTHBAR_HEIGHT);

        this.context.fillStyle = '#2d2d2d';
        this.context.fillRect(0, 0, HEALTHBAR_WIDTH, HEALTHBAR_HEIGHT);

        this.context.strokeStyle = '#000000';
        this.context.lineWidth = 2;
        this.context.strokeRect(1, 1, HEALTHBAR_WIDTH - 2, HEALTHBAR_HEIGHT - 2);
        
        const healthPercentage = this.currentHealth / this.maxHealth;
        const fillWidth = (HEALTHBAR_WIDTH - 4) * healthPercentage;

        if (healthPercentage <= 0.15) {
            this.context.fillStyle = '#ff0000';
        } else if (healthPercentage <= 0.35) {
            this.context.fillStyle = '#ff8800';
        } else if (healthPercentage <= 0.65) {
            this.context.fillStyle = '#ffff00';
        } else {
            this.context.fillStyle = '#00ff00';
        }
        
        this.context.fillRect(2, 2, fillWidth, HEALTHBAR_HEIGHT - 4);

        this.texture.needsUpdate = true;
    }

    setPosition(x: number, y: number, z: number) {
        this.sprite.position.set(x, y + HEALTHBAR_Y_OFFSET, z);
    }

    dispose() {
        this.texture.dispose();
        this.sprite.material.dispose();
    }

    get isDead(): boolean {
        return this.currentHealth <= 0;
    }
} 
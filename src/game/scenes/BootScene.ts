import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.image('galilee', `${base}assets/art/galilee-morning.png`);
    this.load.image('jesus', `${base}assets/art/jesus-hero.png`);
    this.load.image('terrain', `${base}assets/art/galilee-platform.png`);
    this.load.image('brambles', `${base}assets/art/galilee-brambles.png`);
    this.load.image('olive-tree', `${base}assets/art/galilee-olive-v2.png`);
    this.load.image('fishermen', `${base}assets/art/peter-and-andrew.png`);
    this.load.image('fishing-boat', `${base}assets/art/galilee-fishing-boat.png`);
    this.load.spritesheet('galilee-props', `${base}assets/art/galilee-props.png`, {
      frameWidth: 627,
      frameHeight: 627,
    });

    const loadingBar = document.querySelector<HTMLElement>('#loading-bar');
    this.load.on('progress', (progress: number) => {
      if (loadingBar) loadingBar.style.width = `${Math.max(4, progress * 100)}%`;
    });
  }

  create(): void {
    this.createTextures();
    const loadingScreen = document.querySelector<HTMLElement>('#loading-screen');
    loadingScreen?.classList.add('is-hidden');
    this.time.delayedCall(120, () => this.scene.start('Menu'));
  }

  private createTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Golden light collectible.
    g.fillStyle(0xffe6a0, 0.16);
    g.fillCircle(24, 24, 23);
    g.fillStyle(0xf7c85c, 0.25);
    g.fillCircle(24, 24, 16);
    g.fillStyle(0xfff4ba);
    g.fillCircle(24, 22, 7);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(22, 20, 2);
    g.lineStyle(2, 0xe0a83f, 0.8);
    g.strokeCircle(24, 24, 11);
    g.generateTexture('light', 48, 48);
    g.clear();

    // Rolled parchment collectible.
    g.fillStyle(0x71452b, 0.28);
    g.fillEllipse(27, 39, 36, 8);
    g.fillStyle(0xe8c982);
    g.fillRoundedRect(9, 8, 34, 27, 4);
    g.fillStyle(0xffe8ae);
    g.fillRect(14, 10, 24, 23);
    g.lineStyle(2, 0xa76435, 0.75);
    g.strokeCircle(13, 10, 5);
    g.strokeCircle(39, 33, 5);
    g.lineBetween(19, 17, 33, 17);
    g.lineBetween(19, 22, 30, 22);
    g.generateTexture('scroll', 52, 44);
    g.clear();

    // Checkpoint: an olive branch marker with a glowing lamp.
    g.lineStyle(7, 0x67472f);
    g.lineBetween(34, 119, 34, 24);
    g.lineStyle(3, 0x60713b);
    g.lineBetween(34, 50, 15, 32);
    g.lineBetween(34, 68, 53, 47);
    g.fillStyle(0x80934f);
    g.fillEllipse(13, 29, 16, 8);
    g.fillEllipse(55, 44, 16, 8);
    g.fillStyle(0xf2c663);
    g.fillCircle(34, 18, 10);
    g.fillStyle(0xfff0b0);
    g.fillCircle(34, 16, 4);
    g.generateTexture('checkpoint', 70, 124);
    g.clear();

    // Tiny soft texture shared by drifting pollen and landing dust.
    g.fillStyle(0xffe7af, 0.18);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xffefc3, 0.58);
    g.fillCircle(8, 8, 3);
    g.generateTexture('mote', 16, 16);
    g.destroy();
  }
}

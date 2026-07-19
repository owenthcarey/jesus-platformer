import Phaser from 'phaser';
import { AudioManager } from './services/AudioManager';

export const COLORS = {
  ink: 0x102932,
  deep: 0x0b1b22,
  cream: 0xfff4d6,
  parchment: 0xf0d49a,
  gold: 0xe6b55c,
  copper: 0xb86f38,
  blue: 0x27576a,
  olive: 0x6f7e42,
};

export const FONT_TITLE = 'Cinzel, Georgia, serif';
export const FONT_BODY = 'Manrope, Arial, sans-serif';

export function addBackdrop(scene: Phaser.Scene, darkness = 0.32): void {
  scene.add.image(640, 360, 'galilee')
    .setDisplaySize(1280, 720)
    .setScrollFactor(0);

  scene.add.rectangle(640, 360, 1280, 720, COLORS.deep, darkness)
    .setScrollFactor(0);

  const vignette = scene.add.graphics().setScrollFactor(0);
  vignette.fillStyle(COLORS.deep, 0.72);
  vignette.fillRect(0, 0, 1280, 70);
  vignette.fillRect(0, 650, 1280, 70);
  vignette.fillStyle(COLORS.deep, 0.34);
  vignette.fillRect(0, 70, 80, 580);
  vignette.fillRect(1200, 70, 80, 580);
}

export interface ButtonOptions {
  primary?: boolean;
  disabled?: boolean;
  fontSize?: number;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const height = 58;
  const primary = options.primary ?? false;
  const disabled = options.disabled ?? false;
  const fill = primary ? COLORS.gold : COLORS.ink;
  const textColor = primary ? '#142b34' : '#fff4d6';
  const background = scene.add.rectangle(0, 0, width, height, fill, disabled ? 0.38 : 0.96)
    .setStrokeStyle(1, primary ? 0xffe0a0 : 0xd9b978, disabled ? 0.2 : 0.62);
  const shine = scene.add.rectangle(0, -height / 2 + 2, width - 4, 2, 0xffffff, primary ? 0.28 : 0.08);
  const text = scene.add.text(0, 0, label.toUpperCase(), {
    fontFamily: FONT_BODY,
    fontSize: `${options.fontSize ?? 15}px`,
    fontStyle: '600',
    color: textColor,
    letterSpacing: 2,
  }).setOrigin(0.5);

  const container = scene.add.container(x, y, [background, shine, text]);
  if (!disabled) {
    container.setSize(width, height).setInteractive({ useHandCursor: true });
    container.on('pointerover', () => {
      scene.tweens.add({ targets: container, scaleX: 1.025, scaleY: 1.025, duration: 120 });
      background.setFillStyle(primary ? 0xf2c66e : 0x1e4655, 1);
    });
    container.on('pointerout', () => {
      scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 150 });
      background.setFillStyle(fill, 0.96);
    });
    container.on('pointerdown', () => container.setScale(0.985));
    container.on('pointerup', () => {
      container.setScale(1);
      AudioManager.play('select');
      onClick();
    });
  }
  return container;
}

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function fadeToScene(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(320, 10, 25, 32);
  scene.time.delayedCall(330, () => scene.scene.start(key, data));
}

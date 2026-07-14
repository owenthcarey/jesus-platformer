import Phaser from 'phaser';
import './style.css';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { LevelSelectScene } from './game/scenes/LevelSelectScene';
import { GameScene } from './game/scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#152d38',
  transparent: false,
  antialias: true,
  pixelArt: false,
  roundPixels: true,
  render: {
    powerPreference: 'high-performance',
    antialiasGL: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1550 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  input: {
    activePointers: 4,
    gamepad: true,
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene],
};

const game = new Phaser.Game(config);

// Keep keyboard controls reliable after pointer interaction and make the canvas
// discoverable to assistive technology.
game.canvas.tabIndex = 0;
game.canvas.setAttribute(
  'aria-label',
  'The Way game canvas. Use arrow keys or A and D to move, Space or W to jump, E to interact, Escape to pause, and R to return to the last checkpoint.',
);
game.canvas.addEventListener('pointerdown', () => game.canvas.focus());
game.canvas.focus();

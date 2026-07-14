import Phaser from 'phaser';
import { AudioManager } from '../services/AudioManager';
import { SaveManager } from '../services/SaveManager';
import { addBackdrop, COLORS, fadeToScene, FONT_BODY, FONT_TITLE, makeButton } from '../ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    AudioManager.setAmbience(false);
    addBackdrop(this, 0.25);
    this.cameras.main.fadeIn(500, 10, 25, 32);

    const panel = this.add.rectangle(328, 360, 560, 720, COLORS.deep, 0.83);
    panel.setStrokeStyle(1, 0xe6b55c, 0.16);
    this.add.rectangle(609, 360, 2, 560, COLORS.gold, 0.55);

    this.add.text(80, 96, 'A GOSPEL ADVENTURE', {
      fontFamily: FONT_BODY,
      fontSize: '14px',
      fontStyle: '600',
      color: '#e7bd6c',
      letterSpacing: 4,
    });
    this.add.text(74, 126, 'THE\nWAY', {
      fontFamily: FONT_TITLE,
      fontSize: '92px',
      fontStyle: '700',
      color: '#fff4d6',
      lineSpacing: -18,
      shadow: { color: '#000000', blur: 12, offsetY: 5, fill: true },
    });
    this.add.rectangle(80, 328, 105, 3, COLORS.gold, 1).setOrigin(0, 0.5);

    this.add.text(80, 358, 'Walk the roads of Galilee. Seek the light.\nAnswer the call.', {
      fontFamily: FONT_BODY,
      fontSize: '19px',
      color: '#f3e6c7',
      lineSpacing: 9,
    });

    const progress = SaveManager.load();
    const hasProgress = progress.completedLevels.length > 0 || Object.keys(progress.bestTimes).length > 0;
    let transitioning = false;
    const beginJourney = (): void => {
      if (transitioning) return;
      transitioning = true;
      fadeToScene(this, hasProgress ? 'LevelSelect' : 'Game', { level: 1 });
    };
    makeButton(this, 260, 472, 360, hasProgress ? 'Continue journey' : 'Begin the journey', beginJourney, { primary: true });
    makeButton(this, 260, 544, 360, 'Chapter select', () => fadeToScene(this, 'LevelSelect'));

    this.add.text(80, 618, 'Move  A D / ← →     Jump  W / SPACE     Interact  E', {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      color: '#cbbd9d',
      letterSpacing: 0.5,
    });

    const sound = this.add.text(1196, 42, AudioManager.isEnabled() ? 'SOUND  ON' : 'SOUND  OFF', {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '600',
      color: '#fff4d6',
      backgroundColor: '#102932bb',
      padding: { x: 14, y: 9 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    sound.on('pointerup', () => {
      const enabled = AudioManager.toggle();
      sound.setText(enabled ? 'SOUND  ON' : 'SOUND  OFF');
    });

    this.add.text(930, 584, '“Come, follow me.”', {
      fontFamily: FONT_TITLE,
      fontSize: '28px',
      color: '#fff4d6',
      fontStyle: '500',
      shadow: { color: '#15212a', blur: 6, fill: true },
    }).setOrigin(0.5);
    this.add.text(930, 623, 'MATTHEW 4:19', {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 3,
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => AudioManager.unlock());
    this.input.keyboard?.once('keydown-ENTER', () => {
      AudioManager.play('select');
      beginJourney();
    });
    const onGamepadDown = (
      _pad: Phaser.Input.Gamepad.Gamepad,
      button: Phaser.Input.Gamepad.Button,
    ): void => {
      if (button.index !== 0 && button.index !== 9) return;
      AudioManager.play('select');
      beginJourney();
    };
    this.input.gamepad?.on(Phaser.Input.Gamepad.Events.BUTTON_DOWN, onGamepadDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.gamepad?.off(Phaser.Input.Gamepad.Events.BUTTON_DOWN, onGamepadDown);
    });
  }
}

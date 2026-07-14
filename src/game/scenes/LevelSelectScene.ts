import Phaser from 'phaser';
import { LEVELS } from '../data/levels';
import { AudioManager } from '../services/AudioManager';
import { SaveManager } from '../services/SaveManager';
import { addBackdrop, COLORS, fadeToScene, FONT_BODY, FONT_TITLE, formatTime, makeButton } from '../ui';

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create(): void {
    AudioManager.setAmbience(false);
    addBackdrop(this, 0.58);
    this.cameras.main.fadeIn(350, 10, 25, 32);
    const progress = SaveManager.load();
    let transitioning = false;
    const startChapter = (levelId: number): void => {
      if (transitioning) return;
      transitioning = true;
      fadeToScene(this, 'Game', { level: levelId });
    };
    const returnToTitle = (): void => {
      if (transitioning) return;
      transitioning = true;
      fadeToScene(this, 'Menu');
    };

    this.add.text(72, 58, 'THE JOURNEY', {
      fontFamily: FONT_TITLE,
      fontSize: '44px',
      fontStyle: '600',
      color: '#fff4d6',
      letterSpacing: 2,
    });
    this.add.text(74, 112, `${progress.completedLevels.length} OF ${LEVELS.length} CHAPTERS COMPLETE`, {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 2.5,
    });

    LEVELS.forEach((level, index) => {
      const x = 72 + index * 300;
      const y = 205;
      const unlocked = level.id <= progress.unlockedLevel;
      const available = unlocked && level.playable;
      const completed = progress.completedLevels.includes(level.id);
      const card = this.add.rectangle(x, y, 270, 366, COLORS.ink, available ? 0.95 : 0.72)
        .setOrigin(0)
        .setStrokeStyle(1, available ? level.accent : 0xc7b88e, available ? 0.75 : 0.18);
      this.add.rectangle(x, y, 270, 8, level.accent, available ? 1 : 0.25).setOrigin(0);
      this.add.text(x + 24, y + 31, `CHAPTER ${String(level.id).padStart(2, '0')}`, {
        fontFamily: FONT_BODY,
        fontSize: '11px',
        fontStyle: '700',
        color: available ? '#e8b75c' : '#8e917f',
        letterSpacing: 2,
      });
      this.add.text(x + 24, y + 72, level.title, {
        fontFamily: FONT_TITLE,
        fontSize: '24px',
        fontStyle: '600',
        color: available ? '#fff4d6' : '#9b9b8d',
        wordWrap: { width: 215 },
        lineSpacing: 7,
      });
      this.add.text(x + 24, y + 143, level.subtitle.toUpperCase(), {
        fontFamily: FONT_BODY,
        fontSize: '11px',
        color: available ? '#cfc2a3' : '#777d76',
        letterSpacing: 1.5,
      });
      this.add.rectangle(x + 24, y + 179, 46, 2, level.accent, available ? 0.8 : 0.2).setOrigin(0);
      this.add.text(x + 24, y + 204, `“${level.verse}”`, {
        fontFamily: FONT_BODY,
        fontSize: '14px',
        fontStyle: 'italic',
        color: available ? '#e8dfc9' : '#777d76',
        wordWrap: { width: 220 },
        lineSpacing: 4,
      });
      this.add.text(x + 24, y + 294, level.reference.toUpperCase(), {
        fontFamily: FONT_BODY,
        fontSize: '10px',
        fontStyle: '700',
        color: available ? '#e8b75c' : '#686e69',
        letterSpacing: 2,
      });

      if (completed) {
        const rating = progress.bestRatings[level.id] ?? 1;
        this.add.text(x + 24, y + 327, `${'✦'.repeat(rating)}${'·'.repeat(3 - rating)}   ${formatTime(progress.bestTimes[level.id] ?? 0)}`, {
          fontFamily: FONT_BODY,
          fontSize: '13px',
          color: '#f0c96d',
        });
      } else if (!available) {
        this.add.text(x + 24, y + 327, unlocked ? 'COMING SOON' : '◆  LOCKED', {
          fontFamily: FONT_BODY,
          fontSize: '11px',
          fontStyle: '700',
          color: '#858b81',
          letterSpacing: 1.5,
        });
      } else {
        this.add.text(x + 24, y + 327, 'READY TO BEGIN  →', {
          fontFamily: FONT_BODY,
          fontSize: '11px',
          fontStyle: '700',
          color: '#f0c96d',
          letterSpacing: 1.2,
        });
      }

      if (available) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerover', () => card.setFillStyle(0x193d49, 1));
        card.on('pointerout', () => card.setFillStyle(COLORS.ink, 0.95));
        card.on('pointerup', () => startChapter(level.id));
      }
    });

    makeButton(this, 169, 632, 194, 'Back to title', returnToTitle);
    this.add.text(1200, 641, 'Progress is saved automatically', {
      fontFamily: FONT_BODY,
      fontSize: '11px',
      color: '#baaE93',
    }).setOrigin(1, 0.5);

    this.input.keyboard?.once('keydown-ESC', returnToTitle);
    const onGamepadDown = (
      _pad: Phaser.Input.Gamepad.Gamepad,
      button: Phaser.Input.Gamepad.Button,
    ): void => {
      if (button.index === 0) startChapter(1);
      else if (button.index === 1) returnToTitle();
    };
    this.input.gamepad?.on(Phaser.Input.Gamepad.Events.BUTTON_DOWN, onGamepadDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.gamepad?.off(Phaser.Input.Gamepad.Events.BUTTON_DOWN, onGamepadDown);
    });
  }
}

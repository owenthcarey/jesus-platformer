import Phaser from 'phaser';
import { LEVELS, SCRIPTURES, type LevelDefinition } from '../data/levels';
import { Player, type VirtualControls } from '../objects/Player';
import { AudioManager } from '../services/AudioManager';
import { SaveManager } from '../services/SaveManager';
import { COLORS, fadeToScene, FONT_BODY, FONT_TITLE, formatTime, makeButton } from '../ui';

interface DialogueLine {
  speaker: string;
  text: string;
}

interface DialogueState {
  lines: DialogueLine[];
  index: number;
  onComplete?: () => void;
}

interface MovingPlatform extends Phaser.Physics.Arcade.Image {
  travelMin: number;
  travelMax: number;
  signal: Phaser.GameObjects.Arc;
}

const WORLD_HEIGHT = 820;
const GROUND_TOP = 600;
const TOTAL_LIGHTS = 12;
const REGION_BEATS = [
  { x: 1460, title: 'THE OLIVE GROVE', subtitle: 'The road begins to climb' },
  { x: 3180, title: 'THE SHEPHERD\'S RISE', subtitle: 'A high path through Galilee' },
  { x: 4520, title: 'THE EASTERN RIDGE', subtitle: 'The water draws near' },
  { x: 6260, title: 'THE GALILEAN SHORE', subtitle: 'Peter and Andrew wait below' },
] as const;

export class GameScene extends Phaser.Scene {
  private level!: LevelDefinition;
  private player!: Player;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.StaticGroup;
  private lightCollectibles!: Phaser.Physics.Arcade.Group;
  private scrolls!: Phaser.Physics.Arcade.Group;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private goalX = 7160;
  private goalPrompt!: Phaser.GameObjects.Container;
  private lightText!: Phaser.GameObjects.Text;
  private scrollText!: Phaser.GameObjects.Text;
  private courageText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private progressMarker!: Phaser.GameObjects.Arc;
  private hud!: Phaser.GameObjects.Container;
  private atmosphereTint!: Phaser.GameObjects.Rectangle;
  private spawnPoint = new Phaser.Math.Vector2(180, 560);
  private virtualControls: VirtualControls = { left: false, right: false, jump: false };
  private collectedLights = 0;
  private scripturesFound: string[] = [];
  private health = 3;
  private deaths = 0;
  private startedAt = 0;
  private invulnerableUntil = 0;
  private interactionLockUntil = 0;
  private lastDustAt = 0;
  private activeCheckpoint = 0;
  private dialogue?: DialogueState;
  private dialogueBox?: Phaser.GameObjects.Container;
  private dialogueSpeaker?: Phaser.GameObjects.Text;
  private dialogueText?: Phaser.GameObjects.Text;
  private isPaused = false;
  private isComplete = false;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private pauseActions: Phaser.GameObjects.Container[] = [];
  private touchControls?: Phaser.GameObjects.Container;
  private controlHint?: Phaser.GameObjects.Container;
  private toastTween?: Phaser.Tweens.Tween;
  private activeToast?: Phaser.GameObjects.Container;
  private regionCard?: Phaser.GameObjects.Container;
  private regionTween?: Phaser.Tweens.Tween;
  private isIntro = true;
  private isRespawning = false;
  private isCinematic = false;
  private goalSequenceStarted = false;
  private nextRegionIndex = 0;
  private cameraLead = -120;
  private currentObjective = 'FOLLOW THE ROAD TO THE SHORE';
  private pausedAt = 0;
  private pausedDuration = 0;
  private gamepadInteractWasDown = false;
  private gamepadPauseWasDown = false;
  private lastLightCollectedAt = -10000;
  private lightCombo = 0;
  private dialogueTypingEvent?: Phaser.Time.TimerEvent;
  private dialogueFullText = '';
  private reducedMotion = false;

  constructor() {
    super('Game');
  }

  init(data: { level?: number }): void {
    const requested = data.level ?? 1;
    this.level = LEVELS.find((entry) => entry.id === requested && entry.playable) ?? LEVELS[0];
    this.spawnPoint.set(180, 560);
    this.virtualControls = { left: false, right: false, jump: false };
    this.collectedLights = 0;
    this.scripturesFound = [];
    this.health = 3;
    this.deaths = 0;
    this.activeCheckpoint = 0;
    this.startedAt = 0;
    this.invulnerableUntil = 0;
    this.interactionLockUntil = 0;
    this.lastDustAt = 0;
    this.dialogue = undefined;
    this.dialogueBox = undefined;
    this.pauseOverlay = undefined;
    this.pauseActions = [];
    this.touchControls = undefined;
    this.controlHint = undefined;
    this.toastTween = undefined;
    this.activeToast = undefined;
    this.regionCard = undefined;
    this.regionTween = undefined;
    this.isPaused = false;
    this.isComplete = false;
    this.isIntro = true;
    this.isRespawning = false;
    this.isCinematic = false;
    this.goalSequenceStarted = false;
    this.nextRegionIndex = 0;
    this.cameraLead = -120;
    this.currentObjective = 'FOLLOW THE ROAD TO THE SHORE';
    this.pausedAt = 0;
    this.pausedDuration = 0;
    this.gamepadInteractWasDown = false;
    this.gamepadPauseWasDown = false;
    this.lastLightCollectedAt = -10000;
    this.lightCombo = 0;
    this.dialogueTypingEvent = undefined;
    this.dialogueFullText = '';
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  create(): void {
    AudioManager.setJourneyProgress(0);
    AudioManager.setAmbience(true);
    this.physics.world.setBounds(0, 0, this.level.worldWidth, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, this.level.worldWidth, 720);
    this.createBackdrop();
    this.createScenery();
    this.createWorld();
    this.createForegroundLayer();

    this.player = new Player(this, this.spawnPoint.x, this.spawnPoint.y);
    this.player.setVirtualControls(this.virtualControls);
    this.physics.add.collider(
      this.player,
      this.ground,
      undefined,
      (_, platform) => this.canLandOn(platform as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.collider(
      this.player,
      this.movingPlatforms,
      undefined,
      (_, platform) => this.canLandOn(platform as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(this.player, this.lightCollectibles, (_, light) => this.collectLight(light as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.scrolls, (_, scroll) => this.collectScroll(scroll as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.hazards, (_, hazard) => {
      this.takeDamage(hazard as Phaser.Physics.Arcade.Image);
    });
    this.physics.add.overlap(this.player, this.checkpoints, (_, checkpoint) => {
      this.activateCheckpoint(checkpoint as Phaser.Physics.Arcade.Image);
    });

    this.cameras.main.startFollow(this.player, true, 0.085, 0.095, this.cameraLead, 32);
    this.cameras.main.setDeadzone(260, 105);
    this.createHUD();
    this.createGoalPrompt();
    this.createTouchControls();
    this.createControlHint();
    this.bindControls();
    this.showChapterIntro();
    this.startedAt = this.time.now + 2100;
    this.cameras.main.fadeIn(450, 11, 25, 32);
  }

  update(time: number): void {
    this.updateGamepadControls();
    if (this.isPaused || this.isComplete) return;

    this.player.update(time);
    this.updateMovingPlatforms();
    if (this.dialogue || this.isCinematic || this.isRespawning) return;

    this.updateHUD();
    this.updateCamera();
    this.updateGoalPrompt();
    this.updateControlHint();
    this.updateRegionBeats();
    this.emitDust(time);

    if (this.player.y > 785) this.takeDamage();
  }

  private createBackdrop(): void {
    this.add.image(640, 360, 'galilee')
      .setDisplaySize(1280, 720)
      .setScrollFactor(0)
      .setDepth(-100);
    this.add.rectangle(640, 360, 1280, 720, 0x102733, 0.08)
      .setScrollFactor(0)
      .setDepth(-99);

    // A warm atmospheric grade ties the gameplay layer to the painted dawn.
    const sunGlow = this.add.graphics().setScrollFactor(0).setDepth(-98);
    sunGlow.fillStyle(0xffe4a3, 0.05);
    sunGlow.fillCircle(130, 330, 280);
    sunGlow.fillStyle(0xffd384, 0.035);
    sunGlow.fillCircle(130, 330, 430);

    const rays = this.add.graphics().setScrollFactor(0).setDepth(-97);
    rays.fillStyle(0xffefbc, 0.025);
    rays.fillTriangle(-80, 170, 520, 720, 760, 720);
    rays.fillTriangle(90, 115, 700, 720, 910, 720);

    const haze = this.add.graphics().setScrollFactor(0.03).setDepth(-80);
    haze.fillStyle(0xf9dfa2, 0.09);
    haze.fillEllipse(850, 570, 1800, 390);
    haze.fillStyle(0x1b3840, 0.28);
    haze.fillTriangle(-500, 720, 1600, 500, 3000, 720);
    haze.fillTriangle(2500, 720, 4300, 530, 6000, 720);
    haze.fillTriangle(5600, 720, 7600, 500, 8300, 720);

    this.add.particles(0, 0, 'mote', {
      x: { min: 0, max: 1280 },
      y: { min: 190, max: 650 },
      lifespan: { min: 5200, max: 8500 },
      speedX: { min: 5, max: 13 },
      speedY: { min: -7, max: -2 },
      scale: { start: 0.34, end: 0 },
      alpha: { start: 0.32, end: 0 },
      frequency: 280,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    }).setScrollFactor(0).setDepth(3);

    this.atmosphereTint = this.add.rectangle(640, 360, 1280, 720, 0x2b6b7b, 0)
      .setScrollFactor(0)
      .setDepth(24);

    this.createAmbientLife();
  }

  private createAmbientLife(): void {
    const makeFlock = (x: number, y: number, scale: number, duration: number): void => {
      const flock = this.add.container(x, y).setScrollFactor(0.16).setDepth(-72).setScale(scale);
      [[0, 0], [34, 12], [66, -3], [98, 17], [132, 5]].forEach(([birdX, birdY]) => {
        const bird = this.add.graphics();
        bird.lineStyle(2, 0x17323b, 0.34);
        bird.arc(birdX - 6, birdY, 7, Math.PI * 1.08, Math.PI * 1.88);
        bird.arc(birdX + 6, birdY, 7, Math.PI * 1.12, Math.PI * 1.92);
        flock.add(bird);
      });
      this.tweens.add({
        targets: flock,
        x: x + 4300,
        y: y - 92,
        duration,
        repeat: -1,
        repeatDelay: 9000,
        ease: 'Sine.InOut',
      });
    };
    makeFlock(420, 205, 0.72, 54000);
    makeFlock(3320, 250, 0.48, 67000);

    // Sparse pollen in world space makes the route feel alive without
    // competing with the collectible silhouette.
    this.add.particles(0, 0, 'mote', {
      x: { min: 120, max: this.level.worldWidth - 120 },
      y: { min: 405, max: 590 },
      lifespan: { min: 2600, max: 4400 },
      speedX: { min: 7, max: 18 },
      speedY: { min: -11, max: -3 },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.2, end: 0 },
      frequency: this.reducedMotion ? 920 : 480,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(14);
  }

  private createScenery(): void {
    const treePlacements = [
      { x: 760, height: 178, alpha: 0.68, flip: false },
      { x: 2180, height: 226, alpha: 0.78, flip: true },
      { x: 3640, height: 192, alpha: 0.7, flip: false },
      { x: 5160, height: 238, alpha: 0.82, flip: true },
      { x: 6580, height: 184, alpha: 0.74, flip: false },
    ];
    treePlacements.forEach(({ x, height, alpha, flip }, index) => {
      const tree = this.add.image(x, GROUND_TOP + 6, 'olive-tree')
        .setOrigin(0.5, 1)
        .setDisplaySize(height * 1.385, height)
        .setFlipX(flip)
        .setAlpha(alpha)
        .setDepth(index % 2 === 0 ? 1 : 2);
      tree.setTint(index % 2 === 0 ? 0xd9c08a : 0xf0d29a);
    });

    const stones = this.add.graphics().setDepth(3);
    [1360, 2860, 4160, 5860].forEach((x, index) => {
      stones.fillStyle(0x7e5b3d, 0.2);
      stones.fillEllipse(x + 4, 603, 76, 15);
      stones.fillStyle(index % 2 === 0 ? 0xc69b62 : 0xb98b57, 0.88);
      stones.fillRoundedRect(x - 24, 553, 48, 48, 7);
      stones.fillStyle(0xe2bc7b, 0.48);
      stones.fillRoundedRect(x - 19, 557, 38, 9, 4);
      stones.lineStyle(2, 0x7e5b3d, 0.42);
      stones.strokeRoundedRect(x - 24, 553, 48, 48, 7);
    });

    this.add.text(940, 350, 'THE HILLS OF GALILEE', {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      fontStyle: '700',
      color: '#f5d993',
      letterSpacing: 4,
    }).setAlpha(0.58).setOrigin(0.5).setDepth(-4);
    this.add.text(5420, 350, 'THE ROAD TO THE SHORE', {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      fontStyle: '700',
      color: '#f5d993',
      letterSpacing: 4,
    }).setAlpha(0.58).setOrigin(0.5).setDepth(-4);

    this.createLandmarkProps();
    this.createWindStreaks();
    this.createGroundDetails();
  }

  private createLandmarkProps(): void {
    const props = [
      { x: 1345, y: GROUND_TOP + 3, frame: 0, size: 284, depth: 4, flip: false, alpha: 0.92 },
      { x: 2385, y: GROUND_TOP + 5, frame: 1, size: 214, depth: 8, flip: false, alpha: 0.96 },
      { x: 3275, y: GROUND_TOP + 3, frame: 3, size: 164, depth: 4, flip: true, alpha: 0.72 },
      { x: 4525, y: GROUND_TOP + 5, frame: 2, size: 205, depth: 8, flip: false, alpha: 0.94 },
      { x: 5350, y: GROUND_TOP + 4, frame: 3, size: 196, depth: 4, flip: false, alpha: 0.76 },
      { x: 6890, y: GROUND_TOP + 6, frame: 3, size: 178, depth: 8, flip: true, alpha: 0.82 },
      { x: 7288, y: GROUND_TOP + 6, frame: 1, size: 196, depth: 8, flip: true, alpha: 0.9 },
    ] as const;

    props.forEach(({ x, y, frame, size, depth, flip, alpha }) => {
      this.add.image(x, y, 'galilee-props', frame)
        .setOrigin(0.5, 0.85)
        .setDisplaySize(size, size)
        .setFlipX(flip)
        .setAlpha(alpha)
        .setDepth(depth);
    });
  }

  private createWindStreaks(): void {
    if (this.reducedMotion) return;
    [
      { x: 650, y: 292, width: 92, delay: 0 },
      { x: 2460, y: 326, width: 126, delay: 1800 },
      { x: 3980, y: 278, width: 104, delay: 900 },
      { x: 5740, y: 318, width: 138, delay: 2600 },
    ].forEach(({ x, y, width, delay }, index) => {
      const breeze = this.add.graphics().setDepth(-2).setAlpha(0);
      breeze.lineStyle(1.5, 0xffefc4, 0.34);
      breeze.beginPath();
      breeze.moveTo(0, 0);
      breeze.lineTo(width, index % 2 === 0 ? -4 : 4);
      breeze.strokePath();
      breeze.lineStyle(1, 0xffefc4, 0.2);
      breeze.lineBetween(width * 0.24, 9, width * 0.76, 7);
      breeze.setPosition(x, y);
      this.tweens.add({
        targets: breeze,
        x: x + 180,
        alpha: { from: 0, to: 0.5 },
        duration: 2500,
        delay,
        hold: 180,
        yoyo: true,
        repeat: -1,
        repeatDelay: 5200 + index * 700,
        ease: 'Sine.InOut',
      });
    });
  }

  private createForegroundLayer(): void {
    // Large, low-contrast silhouettes occasionally pass in front of the hero.
    // They establish a near camera plane and keep the long road from reading
    // like a flat strip of repeated terrain.
    [
      { x: 1810, width: 470, height: 340, flip: true, alpha: 0.14 },
      { x: 4520, width: 520, height: 375, flip: false, alpha: 0.12 },
      { x: 6120, width: 440, height: 318, flip: true, alpha: 0.15 },
    ].forEach(({ x, width, height, flip, alpha }) => {
      this.add.image(x, 775, 'olive-tree')
        .setOrigin(0.5, 1)
        .setDisplaySize(width, height)
        .setFlipX(flip)
        .setTint(0x18363a)
        .setAlpha(alpha)
        .setScrollFactor(1.035)
        .setDepth(25);
    });
  }

  private createGroundDetails(): void {
    const details = this.add.graphics().setDepth(4);
    const grassClusters = [310, 690, 1030, 1890, 2450, 3370, 4140, 4690, 5360, 5780, 6440, 7040];
    grassClusters.forEach((x, index) => {
      const height = 13 + (index % 4) * 3;
      details.lineStyle(2, index % 2 === 0 ? 0x5d6538 : 0x737647, 0.62);
      for (let blade = -3; blade <= 3; blade += 1) {
        details.lineBetween(x + blade * 4, GROUND_TOP, x + blade * 6, GROUND_TOP - height + Math.abs(blade) * 2);
      }
      if (index % 3 === 0) {
        details.fillStyle(0xe4b95f, 0.78);
        details.fillCircle(x - 11, GROUND_TOP - height + 1, 2.4);
        details.fillCircle(x + 9, GROUND_TOP - height + 4, 2.1);
      }
    });

    [805, 2505, 5255].forEach((x, index) => {
      details.fillStyle(0x4d2f21, 0.22);
      details.fillEllipse(x, GROUND_TOP + 1, 34, 7);
      details.fillStyle(index === 1 ? 0xa95f34 : 0x9a5330, 0.9);
      details.fillRoundedRect(x - 11, GROUND_TOP - 25, 22, 25, 6);
      details.fillStyle(0xd5874b, 0.68);
      details.fillEllipse(x, GROUND_TOP - 24, 17, 5);
      details.lineStyle(2, 0x62351f, 0.7);
      details.strokeRoundedRect(x - 11, GROUND_TOP - 25, 22, 25, 6);
    });

    const waystone = (x: number, numeral: string): void => {
      details.fillStyle(0x5f4632, 0.22);
      details.fillEllipse(x, GROUND_TOP + 2, 54, 10);
      details.fillStyle(0xb88d59, 0.94);
      details.fillRoundedRect(x - 18, GROUND_TOP - 51, 36, 52, 7);
      details.fillStyle(0xe1b875, 0.35);
      details.fillRoundedRect(x - 13, GROUND_TOP - 46, 26, 7, 3);
      this.add.text(x, GROUND_TOP - 27, numeral, {
        fontFamily: FONT_TITLE,
        fontSize: '13px',
        color: '#62442d',
      }).setOrigin(0.5).setDepth(5).setAlpha(0.82);
    };
    waystone(1420, 'I');
    waystone(3100, 'II');
    waystone(4445, 'III');
    waystone(6185, 'IV');
  }

  private createWorld(): void {
    this.ground = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({ allowGravity: false, immovable: true });
    this.hazards = this.physics.add.staticGroup();
    this.lightCollectibles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.scrolls = this.physics.add.group({ allowGravity: false, immovable: true });
    this.checkpoints = this.physics.add.staticGroup();

    [
      { x: 0, width: 1500 },
      { x: 1760, width: 1180 },
      { x: 3220, width: 1000 },
      { x: 4530, width: 1470 },
      { x: 6250, width: 1350 },
    ].forEach(({ x, width }) => this.addPlatform(x + width / 2, 645, width, 90));

    [
      [510, 505, 230], [890, 458, 190], [1225, 410, 175],
      [1515, 548, 118], [1656, 505, 116],
      [1950, 500, 210], [2290, 438, 180], [2590, 520, 190],
      [2950, 548, 145], [3110, 490, 135],
      [3420, 495, 210], [3750, 425, 170], [4050, 520, 190],
      [4245, 552, 126], [4400, 496, 130],
      [4760, 505, 220], [5130, 445, 190], [5480, 510, 210], [5790, 430, 170],
      [6030, 550, 125], [6170, 505, 112],
      [6470, 500, 220], [6800, 438, 180],
    ].forEach(([x, y, width]) => this.addPlatform(x, y, width, 62));

    this.addMovingPlatform(2710, 405, 170, 2580, 2860, 58);
    this.addMovingPlatform(4340, 393, 155, 4240, 4480, -52);
    this.addMovingPlatform(6045, 410, 150, 6010, 6205, 48);

    [1120, 2130, 3520, 3950, 4840, 5610, 6570].forEach((x, index) => {
      const thorn = this.hazards.create(x, GROUND_TOP, 'brambles') as Phaser.Physics.Arcade.Image;
      thorn.setOrigin(0.5, 1).setDisplaySize(110 + (index % 3) * 8, 46 + (index % 3) * 3).setDepth(9);
      thorn.refreshBody();
      const body = thorn.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(thorn.displayWidth * 0.72, thorn.displayHeight * 0.58, true);
      const warning = this.add.ellipse(x, GROUND_TOP - 3, thorn.displayWidth * 0.82, 12, 0x411f18, 0.18)
        .setStrokeStyle(1, 0xd88a4a, 0.18)
        .setDepth(8);
      this.tweens.add({
        targets: warning,
        alpha: { from: 0.2, to: 0.48 },
        scaleX: 1.08,
        duration: 1050 + (index % 3) * 140,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    const lightPositions = [
      [520, 445], [900, 395], [1235, 347], [1645, 447],
      [2050, 438], [2705, 340], [3110, 430], [3760, 365],
      [4410, 434], [5140, 385], [5790, 370], [6810, 378],
    ];
    lightPositions.forEach(([x, y], index) => this.addLight(x, y, index));

    [[1320, 348], [3890, 535], [6510, 438]].forEach(([x, y], index) => this.addScroll(x, y, index));

    [
      { x: 3320, id: 1 },
      { x: 6300, id: 2 },
    ].forEach(({ x, id }) => {
      const restingRing = this.add.ellipse(x, GROUND_TOP - 2, 76, 16, 0xffd879, 0.06)
        .setStrokeStyle(1, 0xffdc78, 0.18)
        .setDepth(7);
      const beacon = this.add.circle(x, GROUND_TOP - 105, 24, 0xffdd7a, 0.07)
        .setStrokeStyle(1, 0xffe5a0, 0.2)
        .setDepth(7);
      this.tweens.add({
        targets: [restingRing, beacon],
        scaleX: 1.22,
        scaleY: 1.22,
        alpha: 0.02,
        duration: 1550 + id * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      const checkpoint = this.checkpoints.create(x, GROUND_TOP, 'checkpoint') as Phaser.Physics.Arcade.Image;
      checkpoint
        .setOrigin(0.5, 1)
        .setData('checkpointId', id)
        .setData('beacon', beacon)
        .setData('restingRing', restingRing)
        .setDepth(8)
        .refreshBody();
    });

    const callingGlow = this.add.ellipse(this.goalX + 20, GROUND_TOP - 76, 220, 240, 0xffe2a0, 0.035)
      .setDepth(1);
    this.tweens.add({
      targets: callingGlow,
      scaleX: 1.12,
      scaleY: 1.06,
      alpha: 0.065,
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    const fishermen = this.add.image(this.goalX + 26, GROUND_TOP, 'fishermen')
      .setOrigin(0.5, 1)
      .setDisplaySize(106, 155)
      .setDepth(10);
    this.tweens.add({ targets: fishermen, y: GROUND_TOP - 2, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const boatShadow = this.add.ellipse(7395, 599, 330, 35, 0x17323b, 0.2).setDepth(2);
    const fishingBoat = this.add.image(7405, 604, 'fishing-boat')
      .setOrigin(0.5, 1)
      .setDisplaySize(390, 215)
      .setDepth(3)
      .setAlpha(0.96);
    this.tweens.add({
      targets: [fishingBoat, boatShadow],
      y: '-=2',
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    const shore = this.add.graphics().setDepth(-3);
    shore.fillStyle(0x3c7892, 0.58);
    shore.fillEllipse(7160, 624, 900, 112);
    shore.fillStyle(0x8fc5ce, 0.14);
    shore.fillEllipse(7120, 606, 760, 45);
    shore.lineStyle(2, 0xd8eff0, 0.48);
    for (let x = 6750; x < 7560; x += 82) shore.arc(x, 597 + (x % 3), 42, Math.PI, Math.PI * 2);
    shore.lineStyle(4, 0x65442c, 0.8);
    shore.lineBetween(7420, 586, 7520, 586);
    shore.lineBetween(7440, 586, 7462, 550);
    shore.lineBetween(7500, 586, 7480, 550);
    shore.lineStyle(2, 0xc7ac79, 0.42);
    shore.lineBetween(7462, 550, 7480, 550);

    [6810, 6995, 7210, 7440].forEach((x, index) => {
      const wave = this.add.ellipse(x, 605 + (index % 2) * 8, 118, 10, 0xd9f0ed, 0.18).setDepth(-2);
      this.tweens.add({
        targets: wave,
        scaleX: 1.45,
        alpha: 0,
        duration: 1900 + index * 180,
        delay: index * 260,
        repeat: -1,
        repeatDelay: 700,
        ease: 'Cubic.Out',
      });
    });
  }

  private addPlatform(x: number, y: number, width: number, height: number): void {
    const segments = Math.max(1, Math.ceil(width / 510));
    const segmentWidth = width / segments;
    const startX = x - width / 2;
    for (let index = 0; index < segments; index += 1) {
      const platform = this.ground.create(startX + segmentWidth * (index + 0.5), y, 'terrain') as Phaser.Physics.Arcade.Image;
      platform
        .setDisplaySize(segmentWidth + (segments > 1 ? 56 : 0), height)
        .setData('oneWay', y < 620)
        .setDepth(5)
        .refreshBody();
    }
  }

  private addMovingPlatform(x: number, y: number, width: number, min: number, max: number, velocity: number): void {
    const rail = this.add.graphics().setDepth(4);
    rail.lineStyle(2, 0xf2cd80, 0.16);
    rail.lineBetween(min, y + 3, max, y + 3);
    rail.fillStyle(0xf7d98c, 0.34);
    rail.fillCircle(min, y + 3, 3);
    rail.fillCircle(max, y + 3, 3);
    const signal = this.add.circle(x, y - 28, 5, 0xffdf89, 0.82)
      .setStrokeStyle(2, 0x704927, 0.55)
      .setDepth(7);
    this.tweens.add({
      targets: signal,
      scale: 1.32,
      alpha: 0.48,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    const platform = this.movingPlatforms.create(x, y, 'terrain') as MovingPlatform;
    platform
      .setDisplaySize(width, 56)
      .setData('oneWay', true)
      .setDepth(6)
      .setVelocityX(velocity)
      .setImmovable(true);
    const body = platform.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    platform.travelMin = min;
    platform.travelMax = max;
    platform.signal = signal;
  }

  private canLandOn(platform: Phaser.Physics.Arcade.Image): boolean {
    if (!platform.getData('oneWay')) return true;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const platformBody = platform.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;
    const previousBottom = playerBody.prev.y + playerBody.height;
    return playerBody.velocity.y >= 0 && previousBottom <= platformBody.top + 12;
  }

  private addLight(x: number, y: number, index: number): void {
    const aura = this.add.circle(x, y, 25, 0xffd979, 0.045)
      .setStrokeStyle(1, 0xffe5a0, 0.34)
      .setDepth(11);
    this.tweens.add({
      targets: aura,
      scale: 1.5,
      alpha: 0,
      duration: 1350 + (index % 3) * 110,
      repeat: -1,
      ease: 'Sine.Out',
    });
    const light = this.lightCollectibles.create(x, y, 'light') as Phaser.Physics.Arcade.Image;
    light.setData('id', index).setData('aura', aura).setDepth(12);
    const body = light.body as Phaser.Physics.Arcade.Body;
    body.setCircle(18, 6, 6);
    this.tweens.add({
      targets: light,
      y: y - 10,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 900 + (index % 3) * 120,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private addScroll(x: number, y: number, index: number): void {
    const scroll = this.scrolls.create(x, y, 'scroll') as Phaser.Physics.Arcade.Image;
    scroll.setData('scriptureIndex', index).setDepth(12);
    this.tweens.add({
      targets: scroll,
      angle: { from: -4, to: 4 },
      y: y - 8,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private createHUD(): void {
    const panel = this.add.rectangle(28, 25, 375, 88, COLORS.deep, 0.88)
      .setOrigin(0)
      .setStrokeStyle(1, 0xe8b75c, 0.28);
    const chapterText = this.add.text(48, 42, 'CHAPTER 01  ·  THE CALL BY THE SEA', {
      fontFamily: FONT_BODY,
      fontSize: '11px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 1.5,
    });
    this.objectiveText = this.add.text(48, 70, 'FOLLOW THE ROAD TO THE SHORE', {
      fontFamily: FONT_BODY,
      fontSize: '15px',
      fontStyle: '600',
      color: '#fff4d6',
    });

    this.lightText = this.add.text(1234, 39, `✦  00 / ${TOTAL_LIGHTS}`, {
      fontFamily: FONT_BODY,
      fontSize: '15px',
      fontStyle: '700',
      color: '#f5cf75',
      backgroundColor: '#102932dd',
      padding: { x: 16, y: 10 },
    }).setOrigin(1, 0);
    this.scrollText = this.add.text(1234, 88, 'SCRIPTURES  0 / 3', {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      fontStyle: '700',
      color: '#f1e0b7',
      backgroundColor: '#102932cc',
      padding: { x: 16, y: 8 },
    }).setOrigin(1, 0);
    this.courageText = this.add.text(48, 132, 'COURAGE   ◆ ◆ ◆', {
      fontFamily: FONT_BODY,
      fontSize: '11px',
      fontStyle: '700',
      color: '#f3dda7',
      letterSpacing: 1.2,
      backgroundColor: '#102932aa',
      padding: { x: 10, y: 7 },
    });

    const progressTrack = this.add.rectangle(410, 48, 440, 4, 0xffffff, 0.14)
      .setOrigin(0, 0.5);
    this.progressFill = this.add.rectangle(410, 48, 4, 4, COLORS.gold, 0.95)
      .setOrigin(0, 0.5);
    this.progressMarker = this.add.circle(410, 48, 5, 0xffe7a2, 1)
      .setStrokeStyle(2, COLORS.deep, 0.72);
    const regionDots = REGION_BEATS.map((beat) => this.add.circle(
      410 + 440 * (beat.x / this.level.worldWidth),
      48,
      2.5,
      0xe8b75c,
      0.46,
    ));
    const startLabel = this.add.text(410, 61, 'GALILEAN HILLS', {
      fontFamily: FONT_BODY,
      fontSize: '9px',
      color: '#d4c39c',
      letterSpacing: 1.5,
    });
    const endLabel = this.add.text(850, 61, 'THE SHORE', {
      fontFamily: FONT_BODY,
      fontSize: '9px',
      color: '#d4c39c',
      letterSpacing: 1.5,
    }).setOrigin(1, 0);

    this.hud = this.add.container(0, 0, [
      panel,
      chapterText,
      this.objectiveText,
      this.lightText,
      this.scrollText,
      this.courageText,
      progressTrack,
      ...regionDots,
      this.progressFill,
      this.progressMarker,
      startLabel,
      endLabel,
    ])
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0);
  }

  private createGoalPrompt(): void {
    const background = this.add.rectangle(0, 0, 274, 50, COLORS.deep, 0.92)
      .setStrokeStyle(1, COLORS.gold, 0.55);
    const key = this.add.rectangle(-105, 0, 46, 28, COLORS.gold, 1);
    const keyText = this.add.text(-105, 0, 'E / X', {
      fontFamily: FONT_BODY,
      fontSize: '10px',
      fontStyle: '700',
      color: '#102932',
    }).setOrigin(0.5);
    const label = this.add.text(-74, 0, 'Speak with the fishermen', {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      color: '#fff4d6',
    }).setOrigin(0, 0.5);
    this.goalPrompt = this.add.container(640, 620, [background, key, keyText, label])
      .setScrollFactor(0)
      .setDepth(1200)
      .setVisible(false);
    this.tweens.add({
      targets: key,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private createTouchControls(): void {
    const isTouch = navigator.maxTouchPoints > 0 || window.innerWidth < 900;
    if (!isTouch) return;

    const elements: Phaser.GameObjects.GameObject[] = [];

    const makeControl = (x: number, y: number, label: string, onDown: () => void, onUp: () => void) => {
      const circle = this.add.circle(x, y, 42, COLORS.deep, 0.62)
        .setStrokeStyle(2, 0xfff4d6, 0.42)
        .setScrollFactor(0)
        .setInteractive();
      const text = this.add.text(x, y, label, {
        fontFamily: FONT_BODY,
        fontSize: '24px',
        fontStyle: '700',
        color: '#fff4d6',
      }).setOrigin(0.5).setScrollFactor(0);
      elements.push(circle, text);
      circle.on('pointerdown', () => {
        AudioManager.unlock();
        circle.setFillStyle(COLORS.gold, 0.78);
        text.setColor('#102932');
        onDown();
      });
      const release = (): void => {
        onUp();
        circle.setFillStyle(COLORS.deep, 0.62);
        text.setColor('#fff4d6');
      };
      circle.on('pointerup', release);
      circle.on('pointerout', release);
      circle.on('pointerupoutside', release);
    };

    makeControl(74, 644, '‹', () => { this.virtualControls.left = true; }, () => { this.virtualControls.left = false; });
    makeControl(170, 644, '›', () => { this.virtualControls.right = true; }, () => { this.virtualControls.right = false; });
    makeControl(
      1196,
      638,
      '↑',
      () => {
        this.virtualControls.jump = true;
        this.player.queueJump();
      },
      () => { this.virtualControls.jump = false; },
    );
    makeControl(1096, 660, 'E', () => this.attemptInteract(), () => undefined);
    this.touchControls = this.add.container(0, 0, elements)
      .setScrollFactor(0)
      .setDepth(1400)
      .setAlpha(0.82);
  }

  private createControlHint(): void {
    const isTouch = navigator.maxTouchPoints > 0 || window.innerWidth < 900;
    if (isTouch) return;

    const background = this.add.rectangle(0, 0, 470, 42, COLORS.deep, 0.78)
      .setStrokeStyle(1, COLORS.gold, 0.24);
    const controls = this.add.text(0, 0, 'A  D   MOVE     SPACE   JUMP     E   SPEAK', {
      fontFamily: FONT_BODY,
      fontSize: '10px',
      fontStyle: '700',
      color: '#eee1c2',
      letterSpacing: 1.2,
    }).setOrigin(0.5);
    this.controlHint = this.add.container(640, 665, [background, controls])
      .setScrollFactor(0)
      .setDepth(1350)
      .setAlpha(0);
  }

  private bindControls(): void {
    this.input.keyboard!.on('keydown-E', () => {
      if (this.time.now <= this.interactionLockUntil || this.isPaused) return;
      this.attemptInteract();
    });
    const continueDialogue = (): void => {
      if (!this.dialogue || this.time.now <= this.interactionLockUntil || this.isPaused) return;
      this.advanceDialogue();
    };
    this.input.keyboard!.on('keydown-SPACE', continueDialogue);
    this.input.keyboard!.on('keydown-ENTER', continueDialogue);
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.isComplete || this.dialogue || this.isIntro || this.isCinematic || this.isRespawning) return;
      this.togglePause();
    });
    this.input.keyboard!.on('keydown-R', () => {
      if (this.isPaused || this.isComplete || this.dialogue || this.isIntro || this.isCinematic || this.isRespawning) return;
      this.respawn(false);
    });
    this.input.once('pointerdown', () => AudioManager.unlock());
  }

  private updateGamepadControls(): void {
    const gamepad = this.input.gamepad?.getPad(0);
    if (!gamepad) return;
    const interactDown = gamepad.buttons[2]?.pressed ?? false;
    const pauseDown = gamepad.buttons[9]?.pressed ?? false;

    if (
      interactDown
      && !this.gamepadInteractWasDown
      && !this.isPaused
      && !this.isIntro
      && !this.isRespawning
    ) {
      AudioManager.unlock();
      this.attemptInteract();
    }
    if (
      pauseDown
      && !this.gamepadPauseWasDown
      && !this.isComplete
      && !this.dialogue
      && !this.isIntro
      && !this.isCinematic
      && !this.isRespawning
    ) {
      this.togglePause();
    }

    this.gamepadInteractWasDown = interactDown;
    this.gamepadPauseWasDown = pauseDown;
  }

  private showChapterIntro(): void {
    this.player.setControlEnabled(false);
    this.touchControls?.setVisible(false);
    const shade = this.add.rectangle(640, 360, 1280, 720, COLORS.deep, 0.28);
    const chapter = this.add.text(640, 288, 'CHAPTER 01', {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 5,
    }).setOrigin(0.5);
    const title = this.add.text(640, 328, this.level.title, {
      fontFamily: FONT_TITLE,
      fontSize: '45px',
      fontStyle: '600',
      color: '#fff4d6',
    }).setOrigin(0.5);
    const place = this.add.text(640, 390, 'GALILEE  ·  EARLY MORNING', {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '600',
      color: '#e9d8b5',
      letterSpacing: 3,
    }).setOrigin(0.5);
    const card = this.add.container(0, 0, [shade, chapter, title, place]).setScrollFactor(0).setDepth(2000);
    this.time.delayedCall(1600, () => {
      this.tweens.add({
        targets: card,
        alpha: 0,
        duration: 550,
        onComplete: () => {
          card.destroy(true);
          this.isIntro = false;
          this.player.setControlEnabled(true);
          this.touchControls?.setVisible(true);
          this.tweens.add({ targets: this.hud, alpha: 1, duration: 380, ease: 'Sine.Out' });
          if (this.controlHint) {
            this.tweens.add({ targets: this.controlHint, alpha: 0.88, y: 658, duration: 320, ease: 'Cubic.Out' });
          }
          this.showToast('FOLLOW THE ROAD EAST', 'Find Peter and Andrew by the shore');
        },
      });
    });
  }

  private collectLight(light: Phaser.Physics.Arcade.Image): void {
    if (!light.active) return;
    const collectedX = light.x;
    const collectedY = light.y;
    const aura = light.getData('aura') as Phaser.GameObjects.Arc | undefined;
    if (aura) {
      this.tweens.killTweensOf(aura);
      aura.destroy();
    }
    light.disableBody(true, true);
    this.collectedLights += 1;
    this.lightCombo = this.time.now - this.lastLightCollectedAt <= 5200 ? this.lightCombo + 1 : 1;
    this.lastLightCollectedAt = this.time.now;
    AudioManager.play('collect');
    if (!this.reducedMotion) this.cameras.main.flash(90, 255, 222, 137, false);
    this.lightText.setText(`✦  ${String(this.collectedLights).padStart(2, '0')} / ${TOTAL_LIGHTS}`);
    this.tweens.add({ targets: this.lightText, scaleX: 1.08, scaleY: 1.08, duration: 90, yoyo: true, ease: 'Sine.Out' });

    const burst = this.add.particles(collectedX, collectedY, 'light', {
      lifespan: 420,
      speed: { min: 30, max: 90 },
      scale: { start: 0.34, end: 0 },
      alpha: { start: 0.8, end: 0 },
      quantity: 7,
      emitting: false,
    }).setDepth(50);
    burst.explode(7);
    this.time.delayedCall(500, () => burst.destroy());

    const camera = this.cameras.main;
    const hudSpark = this.add.image(collectedX - camera.scrollX, collectedY - camera.scrollY, 'light')
      .setScrollFactor(0)
      .setDepth(1700)
      .setScale(0.72);
    this.tweens.add({
      targets: hudSpark,
      x: 1170,
      y: 55,
      scale: 0.28,
      duration: 430,
      ease: 'Cubic.In',
      onComplete: () => hudSpark.destroy(),
    });
    if (this.lightCombo >= 3 && this.collectedLights < TOTAL_LIGHTS) {
      this.showLightTrail(this.lightCombo, collectedX, collectedY);
    }
    if (this.collectedLights === TOTAL_LIGHTS) {
      this.showToast('EVERY LIGHT FOUND', 'A complete path of light');
    }
  }

  private showLightTrail(combo: number, worldX: number, worldY: number): void {
    const label = this.add.text(worldX, worldY - 34, `PATH OF LIGHT  ×${combo}`, {
      fontFamily: FONT_BODY,
      fontSize: '10px',
      fontStyle: '700',
      color: '#fff0b0',
      backgroundColor: '#102932cc',
      padding: { x: 9, y: 5 },
      letterSpacing: 1.2,
    }).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.add({
      targets: label,
      y: worldY - 58,
      alpha: 1,
      duration: 220,
      hold: 520,
      yoyo: true,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private collectScroll(scroll: Phaser.Physics.Arcade.Image): void {
    if (!scroll.active) return;
    const index = scroll.getData('scriptureIndex') as number;
    const scripture = SCRIPTURES[index];
    scroll.disableBody(true, true);
    this.scripturesFound.push(scripture.reference);
    this.scrollText.setText(`SCRIPTURES  ${this.scripturesFound.length} / 3`);
    AudioManager.play('scroll');
    this.startDialogue([
      { speaker: `${scripture.short}  ·  ${scripture.reference}`, text: `“${scripture.verse}”` },
    ]);
  }

  private activateCheckpoint(checkpoint: Phaser.Physics.Arcade.Image): void {
    const id = checkpoint.getData('checkpointId') as number;
    if (id <= this.activeCheckpoint) return;
    this.activeCheckpoint = id;
    this.spawnPoint.set(checkpoint.x + 58, GROUND_TOP - 18);
    this.health = 3;
    checkpoint.setTint(0xffe182);
    const beacon = checkpoint.getData('beacon') as Phaser.GameObjects.Arc | undefined;
    const restingRing = checkpoint.getData('restingRing') as Phaser.GameObjects.Ellipse | undefined;
    if (beacon) beacon.setFillStyle(0xffdc78, 0.22).setStrokeStyle(2, 0xffedb0, 0.58);
    if (restingRing) restingRing.setFillStyle(0xffd879, 0.14).setStrokeStyle(1, 0xffdc78, 0.42);
    this.updateCourageHUD();
    AudioManager.play('checkpoint');
    const glow = this.add.circle(checkpoint.x, checkpoint.y - 88, 18, 0xffdc78, 0.4).setDepth(7);
    this.tweens.add({ targets: glow, scale: 2.8, alpha: 0, duration: 700, ease: 'Cubic.Out', onComplete: () => glow.destroy() });
    this.showToast('A MOMENT OF REST', 'Checkpoint reached · courage restored');
  }

  private updateMovingPlatforms(): void {
    this.movingPlatforms.getChildren().forEach((child) => {
      const platform = child as MovingPlatform;
      if (platform.x <= platform.travelMin && platform.body!.velocity.x < 0) platform.setVelocityX(Math.abs(platform.body!.velocity.x));
      if (platform.x >= platform.travelMax && platform.body!.velocity.x > 0) platform.setVelocityX(-Math.abs(platform.body!.velocity.x));
      platform.signal.setPosition(platform.x, platform.y - 28);
    });
  }

  private updateHUD(): void {
    const progress = Phaser.Math.Clamp(this.player.x / this.level.worldWidth, 0, 1);
    this.progressFill.setDisplaySize(Math.max(4, 440 * progress), 4);
    this.progressMarker.setX(410 + 440 * progress);
    this.atmosphereTint.setAlpha(Phaser.Math.Clamp((progress - 0.68) * 0.15, 0, 0.045));
    AudioManager.setJourneyProgress(progress);

    let nextObjective = 'FOLLOW THE ROAD TO THE SHORE';
    if (this.player.x > 6600) nextObjective = 'SPEAK WITH PETER AND ANDREW';
    else if (this.player.x > 4300) nextObjective = 'FOLLOW THE ROAD TOWARD THE WATER';
    else if (this.player.x > 1800) nextObjective = 'CROSS THE GALILEAN RIDGE';
    if (nextObjective !== this.currentObjective) {
      this.currentObjective = nextObjective;
      this.tweens.killTweensOf(this.objectiveText);
      this.objectiveText.setText(nextObjective).setAlpha(0.25).setX(56);
      this.tweens.add({
        targets: this.objectiveText,
        x: 48,
        alpha: 1,
        duration: 260,
        ease: 'Cubic.Out',
      });
    }
  }

  private updateCamera(): void {
    const targetLead = -this.player.getFacing() * 125;
    this.cameraLead = Phaser.Math.Linear(this.cameraLead, targetLead, 0.035);
    this.cameras.main.setFollowOffset(this.cameraLead, 32);
  }

  private updateGoalPrompt(): void {
    const close = Math.abs(this.player.x - this.goalX) < 150 && Math.abs(this.player.y - GROUND_TOP) < 150;
    this.goalPrompt.setVisible(close && !this.dialogue && !this.isComplete && !this.goalSequenceStarted);
  }

  private updateControlHint(): void {
    if (!this.controlHint || this.player.x < 720) return;
    const hint = this.controlHint;
    this.controlHint = undefined;
    this.tweens.add({
      targets: hint,
      alpha: 0,
      y: 672,
      duration: 320,
      ease: 'Cubic.In',
      onComplete: () => hint.destroy(true),
    });
  }

  private updateRegionBeats(): void {
    const beat = REGION_BEATS[this.nextRegionIndex];
    if (!beat || this.player.x < beat.x || this.isIntro) return;
    this.nextRegionIndex += 1;
    this.showRegionTitle(beat.title, beat.subtitle);
  }

  private showRegionTitle(title: string, subtitle: string): void {
    if (this.activeToast) {
      this.time.delayedCall(2450, () => {
        if (!this.isComplete && !this.isCinematic) this.showRegionTitle(title, subtitle);
      });
      return;
    }
    this.regionTween?.stop();
    this.regionCard?.destroy(true);
    this.regionTween = undefined;
    AudioManager.play('reveal');
    const background = this.add.rectangle(0, 7, 520, 72, COLORS.deep, 0.68)
      .setStrokeStyle(1, COLORS.gold, 0.22);
    const leftRule = this.add.rectangle(-205, 0, 78, 1, COLORS.gold, 0.62);
    const rightRule = this.add.rectangle(205, 0, 78, 1, COLORS.gold, 0.62);
    const titleText = this.add.text(0, -6, title, {
      fontFamily: FONT_BODY,
      fontSize: '11px',
      fontStyle: '700',
      color: '#f1c96e',
      letterSpacing: 3.2,
    }).setOrigin(0.5);
    const subtitleText = this.add.text(0, 19, subtitle, {
      fontFamily: FONT_TITLE,
      fontSize: '16px',
      color: '#fff4d6',
    }).setOrigin(0.5);
    const card = this.add.container(640, 232, [background, leftRule, rightRule, titleText, subtitleText])
      .setScrollFactor(0)
      .setDepth(1750)
      .setAlpha(0);
    this.regionCard = card;
    this.regionTween = this.tweens.add({
      targets: card,
      alpha: 1,
      y: 220,
      duration: 330,
      hold: 1750,
      yoyo: true,
      ease: 'Sine.InOut',
      onComplete: () => {
        if (this.regionCard === card) {
          this.regionTween = undefined;
          this.regionCard = undefined;
        }
        card.destroy(true);
      },
    });
  }

  private emitDust(time: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;
    if (this.player.consumeLanding() && body.velocity.y >= 0) {
      if (!this.reducedMotion) this.cameras.main.shake(70, 0.0014);
      for (let index = 0; index < 5; index += 1) {
        const puff = this.add.image(this.player.x + Phaser.Math.Between(-14, 14), this.player.y - 2, 'mote')
          .setTint(0xcaa56f)
          .setAlpha(0.56)
          .setScale(0.45)
          .setDepth(16);
        this.tweens.add({
          targets: puff,
          x: puff.x + Phaser.Math.Between(-24, 24),
          y: puff.y - Phaser.Math.Between(10, 24),
          scale: 1.25,
          alpha: 0,
          duration: Phaser.Math.Between(320, 470),
          ease: 'Cubic.Out',
          onComplete: () => puff.destroy(),
        });
      }
    }
    if (!grounded || Math.abs(body.velocity.x) < 145 || time - this.lastDustAt < 110) return;
    this.lastDustAt = time;
    const dust = this.add.image(this.player.x - this.player.getFacing() * 20, this.player.y - 4, 'mote')
      .setTint(0xcaa56f)
      .setAlpha(0.44)
      .setScale(0.42)
      .setDepth(15);
    this.tweens.add({ targets: dust, x: dust.x - this.player.getFacing() * 18, y: dust.y - 12, alpha: 0, scale: 1.1, duration: 430, onComplete: () => dust.destroy() });
  }

  private attemptInteract(): void {
    if (this.dialogue) {
      if (this.time.now > this.interactionLockUntil) this.advanceDialogue();
      return;
    }
    if (
      Math.abs(this.player.x - this.goalX) >= 165
      || Math.abs(this.player.y - GROUND_TOP) >= 150
      || this.isComplete
    ) return;
    this.beginGoalSequence();
  }

  private beginGoalSequence(): void {
    if (this.goalSequenceStarted) return;
    this.goalSequenceStarted = true;
    this.isCinematic = true;
    this.player.setControlEnabled(false);
    this.player.setFrozen(true);
    this.touchControls?.setVisible(false);
    this.controlHint?.destroy(true);
    this.controlHint = undefined;
    this.regionTween?.stop();
    this.regionTween = undefined;
    this.regionCard?.destroy(true);
    this.regionCard = undefined;
    this.goalPrompt.setVisible(false);
    this.tweens.add({ targets: this.hud, alpha: 0, duration: 280, ease: 'Sine.In' });

    const topBar = this.add.rectangle(640, -60, 1280, 120, COLORS.deep, 0.98);
    const bottomBar = this.add.rectangle(640, 764, 1280, 88, COLORS.deep, 0.98);
    this.add.container(0, 0, [topBar, bottomBar])
      .setScrollFactor(0)
      .setDepth(2050);
    this.tweens.add({ targets: topBar, y: 60, duration: 520, ease: 'Cubic.Out' });
    this.tweens.add({ targets: bottomBar, y: 676, duration: 520, ease: 'Cubic.Out' });

    AudioManager.play('reveal');
    this.cameras.main.stopFollow();
    this.cameras.main.pan(this.goalX + 92, 360, 720, 'Sine.easeInOut');
    this.time.delayedCall(680, () => {
      this.startDialogue([
        { speaker: 'PETER', text: 'The nets are ready, Andrew. The lake has been generous this morning.' },
        { speaker: 'JESUS', text: 'Come, follow me, and I will send you out to fish for people.' },
        { speaker: 'NARRATOR', text: 'At once they left their nets and followed him.' },
      ], () => this.completeLevel());
    });
  }

  private startDialogue(lines: DialogueLine[], onComplete?: () => void): void {
    if (this.dialogue || this.isComplete) return;
    this.dialogue = { lines, index: 0, onComplete };
    this.interactionLockUntil = this.time.now + 260;
    this.player.setControlEnabled(false);
    this.player.setFrozen(true);
    this.touchControls?.setVisible(false);
    this.goalPrompt.setVisible(false);

    const background = this.add.rectangle(640, 584, 1110, 190, COLORS.deep, 0.96)
      .setStrokeStyle(1, COLORS.gold, 0.55);
    const accent = this.add.rectangle(105, 499, 6, 156, COLORS.gold, 0.95).setOrigin(0, 0);
    this.dialogueSpeaker = this.add.text(142, 524, '', {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 2,
    });
    this.dialogueText = this.add.text(142, 558, '', {
      fontFamily: FONT_TITLE,
      fontSize: '22px',
      color: '#fff4d6',
      wordWrap: { width: 950 },
      lineSpacing: 8,
    });
    const hint = this.add.text(1165, 644, 'E / SPACE / TAP  TO CONTINUE', {
      fontFamily: FONT_BODY,
      fontSize: '10px',
      fontStyle: '700',
      color: '#cbbd9d',
      letterSpacing: 1.4,
    }).setOrigin(1, 0.5);
    background.setInteractive().on('pointerup', () => {
      if (this.time.now > this.interactionLockUntil) this.advanceDialogue();
    });
    this.dialogueBox = this.add.container(0, 40, [background, accent, this.dialogueSpeaker, this.dialogueText, hint])
      .setScrollFactor(0)
      .setDepth(2100)
      .setAlpha(0);
    this.tweens.add({ targets: this.dialogueBox, y: 0, alpha: 1, duration: 260, ease: 'Cubic.Out' });
    this.renderDialogueLine();
  }

  private renderDialogueLine(): void {
    if (!this.dialogue || !this.dialogueSpeaker || !this.dialogueText) return;
    const line = this.dialogue.lines[this.dialogue.index];
    this.dialogueTypingEvent?.remove(false);
    this.dialogueTypingEvent = undefined;
    this.dialogueFullText = line.text;
    this.dialogueSpeaker.setText(line.speaker.toUpperCase());
    this.dialogueText.setText('');
    this.dialogueSpeaker.setAlpha(0);
    this.dialogueText.setAlpha(1).setY(558);
    this.tweens.add({ targets: this.dialogueSpeaker, alpha: 1, duration: 180, ease: 'Sine.Out' });
    const characters = Array.from(line.text);
    let characterIndex = 0;
    this.dialogueTypingEvent = this.time.addEvent({
      delay: this.reducedMotion ? 4 : 17,
      repeat: Math.max(0, characters.length - 1),
      callback: () => {
        characterIndex += 1;
        this.dialogueText?.setText(characters.slice(0, characterIndex).join(''));
        if (characterIndex >= characters.length) this.dialogueTypingEvent = undefined;
      },
      callbackScope: this,
    });
  }

  private advanceDialogue(): void {
    if (!this.dialogue) return;
    if (this.dialogueTypingEvent) {
      this.dialogueTypingEvent.remove(false);
      this.dialogueTypingEvent = undefined;
      this.dialogueText?.setText(this.dialogueFullText);
      this.interactionLockUntil = this.time.now + 90;
      return;
    }
    this.dialogue.index += 1;
    this.interactionLockUntil = this.time.now + 180;
    if (this.dialogue.index < this.dialogue.lines.length) {
      AudioManager.play('select');
      this.renderDialogueLine();
      return;
    }

    const callback = this.dialogue.onComplete;
    this.dialogue = undefined;
    const box = this.dialogueBox;
    this.dialogueBox = undefined;
    if (box) {
      this.tweens.add({
        targets: box,
        y: 35,
        alpha: 0,
        duration: 200,
        onComplete: () => box.destroy(true),
      });
    }
    if (callback) callback();
    else {
      this.player.setFrozen(false);
      this.player.setControlEnabled(true);
      this.touchControls?.setVisible(true);
    }
  }

  private takeDamage(source?: Phaser.Physics.Arcade.Image): void {
    if (
      this.time.now < this.invulnerableUntil
      || this.isComplete
      || this.isRespawning
      || this.isCinematic
      || this.dialogue
    ) return;
    this.invulnerableUntil = this.time.now + 1100;
    this.health -= 1;
    this.deaths += 1;
    AudioManager.play('hurt');
    this.player.flashDamage();
    if (!this.reducedMotion) {
      this.cameras.main.shake(190, 0.012);
      this.cameras.main.flash(160, 110, 25, 18, false);
    }
    if (source) {
      source.setTint(0xffa46d);
      this.time.delayedCall(210, () => {
        if (source.active) source.clearTint();
      });
    }
    if (this.health <= 0) {
      this.health = 3;
      this.showToast('TAKE COURAGE', 'The road continues from your last rest');
    }
    this.updateCourageHUD();
    if (source) {
      this.player.setControlEnabled(false);
      this.player.setVelocity(-this.player.getFacing() * 215, -285);
      this.time.delayedCall(170, () => this.respawn(true));
    } else {
      this.respawn(true);
    }
  }

  private updateCourageHUD(): void {
    const full = '◆ '.repeat(Math.max(0, this.health));
    const empty = '◇ '.repeat(Math.max(0, 3 - this.health));
    this.courageText.setText(`COURAGE   ${full}${empty}`.trim());
  }

  private respawn(fromDamage: boolean): void {
    if (this.isRespawning) return;
    this.isRespawning = true;
    this.player.setControlEnabled(false);
    this.player.setFrozen(false);
    this.player.setVelocity(0, 0);
    if (!fromDamage) {
      this.health = 3;
      this.updateCourageHUD();
      this.showToast('RETURNED TO THE PATH', 'Last checkpoint restored · courage renewed');
    }
    this.goalPrompt.setVisible(false);
    this.cameras.main.fadeOut(190, 11, 25, 32);
    this.time.delayedCall(200, () => {
      this.player.setPosition(this.spawnPoint.x, this.spawnPoint.y);
      this.player.syncVisual();
      this.player.setVisualAlpha(0.34);
      this.cameras.main.setScroll(
        Phaser.Math.Clamp(this.spawnPoint.x - 500, 0, this.level.worldWidth - 1280),
        0,
      );
      this.cameras.main.fadeIn(260, 11, 25, 32);
      const visualFade = { alpha: 0.34 };
      this.tweens.add({
        targets: visualFade,
        alpha: 1,
        duration: 620,
        ease: 'Sine.Out',
        onUpdate: () => this.player.setVisualAlpha(visualFade.alpha),
        onComplete: () => {
          this.player.setVisualAlpha(1);
          this.player.setControlEnabled(true);
          this.isRespawning = false;
        },
      });
    });
  }

  private showToast(title: string, subtitle: string): void {
    this.toastTween?.stop();
    this.activeToast?.destroy(true);
    this.activeToast = undefined;
    const background = this.add.rectangle(640, 150, 430, 72, COLORS.deep, 0.9)
      .setStrokeStyle(1, COLORS.gold, 0.34);
    const titleText = this.add.text(640, 136, title, {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 2,
    }).setOrigin(0.5);
    const subtitleText = this.add.text(640, 163, subtitle, {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      color: '#fff4d6',
    }).setOrigin(0.5);
    const toast = this.add.container(0, -30, [background, titleText, subtitleText])
      .setScrollFactor(0)
      .setDepth(1800)
      .setAlpha(0);
    this.activeToast = toast;
    this.toastTween = this.tweens.add({
      targets: toast,
      y: 0,
      alpha: 1,
      duration: 260,
      hold: 2100,
      yoyo: true,
      onComplete: () => {
        if (this.activeToast === toast) this.activeToast = undefined;
        toast.destroy(true);
      },
    });
  }

  private togglePause(): void {
    if (this.isComplete) return;
    this.isPaused = !this.isPaused;
    if (!this.isPaused) {
      this.pausedDuration += Math.max(0, this.time.now - this.pausedAt);
      this.physics.resume();
      this.player.setControlEnabled(true);
      this.touchControls?.setVisible(true);
      this.pauseOverlay?.destroy(true);
      this.pauseOverlay = undefined;
      this.pauseActions.forEach((action) => action.destroy(true));
      this.pauseActions = [];
      return;
    }

    this.pausedAt = this.time.now;
    this.physics.pause();
    this.player.setControlEnabled(false);
    this.touchControls?.setVisible(false);
    const shade = this.add.rectangle(640, 360, 1280, 720, COLORS.deep, 0.82);
    const panel = this.add.rectangle(640, 360, 500, 440, COLORS.ink, 0.98).setStrokeStyle(1, COLORS.gold, 0.48);
    const title = this.add.text(640, 205, 'Journey Paused', {
      fontFamily: FONT_TITLE,
      fontSize: '38px',
      color: '#fff4d6',
    }).setOrigin(0.5);
    const verse = this.add.text(640, 263, '“Be still, and know that I am God.”\nPSALM 46:10', {
      fontFamily: FONT_BODY,
      fontSize: '14px',
      color: '#ddcda9',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);
    const journeyStats = this.add.text(
      640,
      311,
      `LIGHTS  ${this.collectedLights} / ${TOTAL_LIGHTS}     ·     SCRIPTURES  ${this.scripturesFound.length} / ${SCRIPTURES.length}`,
      {
        fontFamily: FONT_BODY,
        fontSize: '10px',
        fontStyle: '700',
        color: '#bfb596',
        letterSpacing: 1.3,
      },
    ).setOrigin(0.5);
    const resume = makeButton(this, 640, 355, 330, 'Resume', () => this.togglePause(), { primary: true });
    const restart = makeButton(this, 640, 426, 330, 'Return to checkpoint', () => {
      this.pausedDuration += Math.max(0, this.time.now - this.pausedAt);
      this.physics.resume();
      this.isPaused = false;
      this.pauseOverlay?.destroy(true);
      this.pauseOverlay = undefined;
      this.pauseActions.forEach((action) => action.destroy(true));
      this.pauseActions = [];
      this.player.setControlEnabled(true);
      this.touchControls?.setVisible(true);
      this.respawn(false);
    });
    const exit = makeButton(this, 640, 497, 330, 'Chapter select', () => {
      this.physics.resume();
      fadeToScene(this, 'LevelSelect');
    });
    const controls = this.add.text(640, 548, 'ESC / START  RESUME     ·     R  LAST CHECKPOINT', {
      fontFamily: FONT_BODY,
      fontSize: '9px',
      fontStyle: '700',
      color: '#8f937f',
      letterSpacing: 1.3,
    }).setOrigin(0.5);
    this.pauseOverlay = this.add.container(0, 0, [shade, panel, title, verse, journeyStats, controls])
      .setScrollFactor(0)
      .setDepth(3000);
    this.pauseActions = [resume, restart, exit];
    this.pauseActions.forEach((action) => action.setScrollFactor(0).setDepth(3001));
  }

  private completeLevel(): void {
    if (this.isComplete) return;
    this.isComplete = true;
    this.player.setControlEnabled(false);
    this.touchControls?.setVisible(false);
    this.physics.pause();
    AudioManager.play('complete');
    const elapsed = Math.max(1000, this.time.now - this.startedAt - this.pausedDuration);
    const foundEveryScripture = this.scripturesFound.length === SCRIPTURES.length;
    const walkedWithCare = this.collectedLights >= 10 && this.deaths <= 2;
    const rating = 1 + Number(foundEveryScripture) + Number(walkedWithCare);
    const previousBest = SaveManager.load().bestTimes[this.level.id];
    const isNewBest = previousBest === undefined || elapsed < previousBest;
    SaveManager.completeLevel(this.level.id, elapsed, rating, this.scripturesFound);

    const shade = this.add.rectangle(640, 360, 1280, 720, COLORS.deep, 0.85);
    const panel = this.add.rectangle(640, 352, 660, 590, COLORS.ink, 0.98).setStrokeStyle(1, COLORS.gold, 0.65);
    const eyebrow = this.add.text(640, 108, 'CHAPTER COMPLETE', {
      fontFamily: FONT_BODY,
      fontSize: '12px',
      fontStyle: '700',
      color: '#e8b75c',
      letterSpacing: 4,
    }).setOrigin(0.5);
    const title = this.add.text(640, 145, this.level.title, {
      fontFamily: FONT_TITLE,
      fontSize: '39px',
      color: '#fff4d6',
    }).setOrigin(0.5);
    const stars = this.add.text(640, 208, `${'✦'.repeat(rating)}${'·'.repeat(3 - rating)}`, {
      fontFamily: FONT_TITLE,
      fontSize: '40px',
      color: '#f2ca70',
      letterSpacing: 12,
    }).setOrigin(0.5);
    const distinctionLabel = rating === 3
      ? 'A ROAD WALKED WITH CARE'
      : foundEveryScripture
        ? 'THE WORD DISCOVERED'
        : walkedWithCare
          ? 'A STEADY PILGRIMAGE'
          : 'THE CALL ANSWERED';
    const distinction = this.add.text(640, 246, distinctionLabel, {
      fontFamily: FONT_BODY,
      fontSize: '10px',
      fontStyle: '700',
      color: '#d7c59d',
      letterSpacing: 2.2,
    }).setOrigin(0.5);
    const mastery = this.add.text(640, 276, 'MASTERY  ·  ALL SCRIPTURES  ·  10 LIGHTS  ·  2 STUMBLES OR FEWER', {
      fontFamily: FONT_BODY,
      fontSize: '9px',
      fontStyle: '700',
      color: '#8f9885',
      letterSpacing: 1.15,
    }).setOrigin(0.5);
    const stats = this.add.text(640, 350,
      `TIME                 ${formatTime(elapsed)}${isNewBest ? '   NEW BEST' : ''}\nLIGHTS FOUND          ${this.collectedLights} / ${TOTAL_LIGHTS}\nSCRIPTURES FOUND      ${this.scripturesFound.length} / ${SCRIPTURES.length}\nSTUMBLES              ${this.deaths}`,
      {
        fontFamily: FONT_BODY,
        fontSize: '14px',
        fontStyle: '600',
        color: '#eadfc7',
        lineSpacing: 14,
      },
    ).setOrigin(0.5);
    const verse = this.add.text(640, 437, '“Come, follow me.”  ·  MATTHEW 4:19', {
      fontFamily: FONT_TITLE,
      fontSize: '16px',
      color: '#e8b75c',
    }).setOrigin(0.5);
    const select = makeButton(this, 640, 511, 380, 'Return to the journey', () => {
      this.physics.resume();
      fadeToScene(this, 'LevelSelect');
    }, { primary: true });
    const replay = makeButton(this, 640, 582, 380, 'Walk this road again', () => {
      this.physics.resume();
      this.scene.restart({ level: 1 });
    });
    const next = this.add.text(640, 627, 'NEXT  ·  PEACE, BE STILL  ·  COMING SOON', {
      fontFamily: FONT_BODY,
      fontSize: '10px',
      fontStyle: '700',
      color: '#9ea18f',
      letterSpacing: 2,
    }).setOrigin(0.5);
    select.setScrollFactor(0).setDepth(4001).setAlpha(0);
    replay.setScrollFactor(0).setDepth(4001).setAlpha(0);
    const completionCard = this.add.container(0, 16, [shade, panel, eyebrow, title, stars, distinction, mastery, stats, verse, next])
      .setScrollFactor(0)
      .setDepth(4000)
      .setAlpha(0);
    this.tweens.add({ targets: completionCard, y: 0, alpha: 1, duration: 520, ease: 'Cubic.Out' });
    this.tweens.add({ targets: [select, replay], alpha: 1, duration: 520, ease: 'Cubic.Out' });

    const celebration = this.add.particles(0, 0, 'mote', {
      x: { min: 250, max: 1030 },
      y: 80,
      lifespan: { min: 1900, max: 3000 },
      speedX: { min: -28, max: 28 },
      speedY: { min: 18, max: 48 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.65, end: 0 },
      frequency: 110,
      quantity: 1,
      tint: [0xffe3a0, 0xe8b75c, 0xfff4d6],
      blendMode: Phaser.BlendModes.ADD,
    }).setScrollFactor(0).setDepth(4002);
    this.time.delayedCall(4200, () => {
      celebration.stop();
      this.time.delayedCall(3100, () => celebration.destroy());
    });
  }
}

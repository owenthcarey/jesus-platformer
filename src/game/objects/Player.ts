import Phaser from 'phaser';
import { AudioManager } from '../services/AudioManager';

export interface VirtualControls {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  private visual: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys: Record<'left' | 'right' | 'jump', Phaser.Input.Keyboard.Key>;
  private virtual: VirtualControls = { left: false, right: false, jump: false };
  private lastGroundedAt = 0;
  private jumpQueuedAt = -1000;
  private wasGrounded = false;
  private canControl = true;
  private facing = 1;
  private landedThisFrame = false;
  private previousVelocityY = 0;
  private lastFootstepAt = 0;
  private landingCompression = 0;
  private takeoffStretch = 0;
  private landingPoseUntil = 0;
  private takeoffPoseUntil = 0;
  private currentPresentationFrame = -1;
  private lastStrideFrameAt = 0;
  private strideFrame = 1;
  private gamepadJumpWasDown = false;
  private forceGroundedPresentation = false;
  private readonly physicsScale = 0.137;
  private readonly visualScale = 0.245;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'jesus');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setScale(this.physicsScale);
    this.setDepth(19).setAlpha(0);
    this.setMaxVelocity(315, 760);
    this.setDragX(1750);
    this.setCollideWorldBounds(false);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(238, 790);
    body.setOffset(140, 136);

    // Keep the physics body completely stable while animating a separate
    // painted presentation layer. Pose changes never compromise collision
    // feel or move the hero's gameplay footprint.
    this.shadow = scene.add.ellipse(x, y + 2, 38, 10, 0x0b1b22, 0.24).setDepth(18);
    this.visual = scene.add.image(x, y + 28, 'jesus-movement', 0)
      .setOrigin(0.5, 1)
      .setScale(this.visualScale)
      .setDepth(20);

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.keys = scene.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.W,
    }) as Record<'left' | 'right' | 'jump', Phaser.Input.Keyboard.Key>;

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.visual.active) this.visual.destroy();
      if (this.shadow.active) this.shadow.destroy();
    });
  }

  setVirtualControls(controls: VirtualControls): void {
    this.virtual = controls;
  }

  queueJump(): void {
    this.jumpQueuedAt = this.scene.time.now;
  }

  setControlEnabled(enabled: boolean): void {
    this.canControl = enabled;
    if (!enabled) {
      this.setAccelerationX(0);
      this.jumpQueuedAt = -1000;
    }
  }

  isControlEnabled(): boolean {
    return this.canControl;
  }

  update(time: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const grounded = this.forceGroundedPresentation || body.blocked.down || body.touching.down;
    const gamepad = this.scene.input.gamepad?.getPad(0);
    const gamepadJumpDown = gamepad?.buttons[0]?.pressed ?? false;
    this.landedThisFrame = false;
    if (grounded) this.lastGroundedAt = time;

    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.space)
      || Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.jump)
      || (gamepadJumpDown && !this.gamepadJumpWasDown);
    if (this.canControl && jumpPressed) this.queueJump();
    this.gamepadJumpWasDown = gamepadJumpDown;

    if (this.canControl) {
      const horizontalAxis = gamepad?.axes[0]?.getValue() ?? 0;
      const left = this.cursors.left.isDown
        || this.keys.left.isDown
        || this.virtual.left
        || horizontalAxis < -0.28
        || (gamepad?.left ?? false);
      const right = this.cursors.right.isDown
        || this.keys.right.isDown
        || this.virtual.right
        || horizontalAxis > 0.28
        || (gamepad?.right ?? false);
      const direction = Number(right) - Number(left);
      if (direction !== 0) {
        const changingDirection = Math.sign(body.velocity.x) !== direction && Math.abs(body.velocity.x) > 45;
        const acceleration = grounded ? (changingDirection ? 2350 : 1850) : 1060;
        this.setAccelerationX(direction * acceleration);
        this.facing = direction;
      } else {
        this.setAccelerationX(0);
      }

      if (time - this.jumpQueuedAt < 135 && time - this.lastGroundedAt < 115) {
        this.setVelocityY(-635);
        this.jumpQueuedAt = -1000;
        this.lastGroundedAt = -1000;
        this.takeoffStretch = 1;
        this.takeoffPoseUntil = time + 125;
        AudioManager.play('jump');
      }

      const jumpHeld = this.cursors.space.isDown
        || this.cursors.up.isDown
        || this.keys.jump.isDown
        || gamepadJumpDown
        || this.virtual.jump;
      if (!jumpHeld && body.velocity.y < -210) this.setVelocityY(body.velocity.y * 0.78);
    }

    if (grounded && !this.wasGrounded && body.velocity.y >= 0) {
      AudioManager.play('land');
      this.landedThisFrame = true;
      this.landingCompression = Phaser.Math.Clamp(Math.abs(this.previousVelocityY) / 680, 0.38, 1);
      this.landingPoseUntil = time + 155;
    }
    this.wasGrounded = grounded;

    const speedRatio = Phaser.Math.Clamp(Math.abs(body.velocity.x) / 315, 0, 1);
    if (grounded && speedRatio > 0.34 && time - this.lastFootstepAt > 245 - speedRatio * 45) {
      this.lastFootstepAt = time;
      AudioManager.play('step');
    }

    this.updatePresentation(time, grounded, speedRatio);
    this.previousVelocityY = body.velocity.y;
  }

  private updatePresentation(time: number, grounded: boolean, speedRatio: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const moving = grounded && speedRatio > 0.1;
    const stride = moving ? Math.sin(time * (0.014 + speedRatio * 0.008)) : 0;
    const airStretch = grounded ? 0 : Phaser.Math.Clamp(-body.velocity.y / 900, -0.45, 0.55);

    let frame = 0;
    if (!grounded) {
      frame = time < this.takeoffPoseUntil ? 3 : 4;
    } else if (time < this.landingPoseUntil) {
      frame = 5;
    } else if (speedRatio > 0.72) {
      if (time - this.lastStrideFrameAt > 155 - speedRatio * 28) {
        this.lastStrideFrameAt = time;
        this.strideFrame = this.strideFrame === 1 ? 2 : 1;
      }
      frame = this.strideFrame;
    } else if (speedRatio > 0.1) {
      frame = 1;
    }
    if (frame !== this.currentPresentationFrame) {
      this.currentPresentationFrame = frame;
      this.visual.setFrame(frame);
    }

    this.landingCompression = Phaser.Math.Linear(this.landingCompression, 0, 0.17);
    this.takeoffStretch = Phaser.Math.Linear(this.takeoffStretch, 0, 0.14);

    const targetScaleX = this.visualScale * (
      1
      + this.landingCompression * 0.075
      - this.takeoffStretch * 0.035
      - airStretch * 0.018
      + Math.abs(stride) * 0.006
    );
    const targetScaleY = this.visualScale * (
      1
      - this.landingCompression * 0.095
      + this.takeoffStretch * 0.06
      + airStretch * 0.028
      - Math.abs(stride) * 0.006
    );
    const targetLean = grounded
      ? body.velocity.x * 0.00005 + stride * 0.006 * this.facing
      : Phaser.Math.Clamp(body.velocity.x * 0.00012, -0.045, 0.045);

    const poseOffset = [4, 6, 5, 10, 13, 11][frame] * this.facing;
    this.visual
      .setPosition(
        this.x + poseOffset,
        this.y + 28 + (moving ? stride * 0.7 : Math.sin(time * 0.0024) * 0.35),
      )
      .setFlipX(this.facing < 0)
      .setRotation(Phaser.Math.Linear(this.visual.rotation, targetLean, 0.14))
      .setScale(
        Phaser.Math.Linear(this.visual.scaleX, targetScaleX, 0.2),
        Phaser.Math.Linear(this.visual.scaleY, targetScaleY, 0.2),
      );

    this.shadow
      .setPosition(this.x, this.y + 2)
      .setVisible(grounded)
      .setScale(0.82 + speedRatio * 0.22, 0.82 - speedRatio * 0.08);
  }

  getFacing(): number {
    return this.facing;
  }

  face(direction: number): void {
    this.facing = direction < 0 ? -1 : 1;
    this.visual.setFlipX(this.facing < 0);
  }

  consumeLanding(): boolean {
    const landed = this.landedThisFrame;
    this.landedThisFrame = false;
    return landed;
  }

  setVisualAlpha(alpha: number): void {
    this.visual.setAlpha(alpha);
    this.shadow.setAlpha(0.24 * alpha);
  }

  syncVisual(): void {
    this.visual.setPosition(this.x, this.y + 28);
    this.shadow.setPosition(this.x, this.y + 2);
  }

  setFrozen(frozen: boolean, groundedPresentation = false): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.forceGroundedPresentation = frozen && (groundedPresentation || this.forceGroundedPresentation);
    body.setAllowGravity(!frozen);
    if (frozen) {
      this.setVelocity(0, 0);
      this.setAcceleration(0, 0);
    }
  }

  flashDamage(): void {
    this.visual.setTint(0xffb09a);
    this.scene.tweens.add({
      targets: this.visual,
      alpha: 0.28,
      duration: 75,
      yoyo: true,
      repeat: 5,
      onComplete: () => {
        if (!this.visual.active) return;
        this.visual.clearTint().setAlpha(1);
      },
    });
  }
}

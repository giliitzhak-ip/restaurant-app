/**
 * GameConfig — the single source of truth for every tunable number in STANGA.
 * Nothing in the codebase is allowed to hard-code gameplay values; import from here.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';
export type QualityLevel = 'low' | 'medium' | 'high';
export type ShakeLevel = 'off' | 'subtle' | 'normal';
export type HudScale = 'small' | 'normal' | 'large';

/** Frame parts of a goal. Each one is a separate collider with its own score value. */
export type GoalPart = 'leftPost' | 'rightPost' | 'crossbar' | 'leftJunction' | 'rightJunction';

/** Every kind of event that can award points. */
export type ScoreKind = 'goal' | 'post' | 'crossbar' | 'junction';

export interface DifficultyProfile {
  /** Seconds the AI waits before reacting to a new situation. */
  readonly reactionTime: number;
  /** Multiplier applied to the AI movement speed. */
  readonly speedMultiplier: number;
  /** Maximum aiming error in radians. */
  readonly aimError: number;
  /** Random spread applied to the AI shot power (0..1). */
  readonly powerJitter: number;
  /** Probability per decision of attempting a tackle when in range. */
  readonly tackleAggression: number;
  /** Distance from the target goal under which the AI is willing to shoot. */
  readonly shootingRange: number;
}

export interface QualityProfile {
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly maxPixelRatio: number;
  /** Anti-aliasing for the render target. */
  readonly antialias: boolean;
  /** Extra scenery detail (fences, props, crowd silhouettes). */
  readonly sceneryDetail: number;
}

export const GameConfig = {
  /** Simulation runs at a fixed rate, fully decoupled from the render rate. */
  simulation: {
    tickRate: 60,
    get fixedDeltaMs(): number {
      return 1000 / this.tickRate;
    },
    get fixedDeltaSeconds(): number {
      return 1 / this.tickRate;
    },
    /**
     * Never simulate more than this many ticks in one frame (spiral-of-death guard).
     * 8 ticks lets the simulation keep real time down to ~8 rendered FPS; below
     * that the match deliberately runs slow rather than skipping simulation.
     */
    maxTicksPerFrame: 8,
    /** Frame deltas above this are clamped (tab was in the background, etc). */
    maxFrameDeltaMs: 250,
  },

  match: {
    durationSeconds: 180,
    /** Freeze time after a scoring event, while the banner is shown. */
    celebrationSeconds: 2.2,
    /** Countdown before the ball becomes live at kickoff. */
    kickoffSeconds: 1.4,
    /** Points per event kind. */
    points: {
      goal: 1,
      post: 2,
      crossbar: 3,
      junction: 5,
    } as const satisfies Record<ScoreKind, number>,
  },

  scoring: {
    /** All contacts of one shot inside this window compete; the best one wins. */
    windowSeconds: 0.45,
    /** The same collider cannot re-trigger for the same ball inside this window. */
    colliderCooldownSeconds: 0.6,
    /**
     * Slow, accidental bumps never score. A goal is the exception: a ball that
     * trickles over the line after a real shot is still a goal.
     */
    minContactSpeed: 4.5,
    minGoalSpeed: 0.4,
    /** A shot stops being "live" after this long without a scoring contact. */
    shotLifetimeSeconds: 6,
    /** Priority order, highest first. Used to pick the best event of a shot. */
    priority: ['junction', 'crossbar', 'post', 'goal'] as const,
  },

  field: {
    /** Along Z. Goals sit at -length/2 and +length/2. */
    length: 34,
    /** Along X. */
    width: 21,
    wallHeight: 2.6,
    wallThickness: 0.4,
    /** Painted boundary line inset from the wall. */
    lineInset: 0.6,
  },

  goal: {
    /** Inner width between the posts. */
    width: 5.2,
    /** Inner height under the crossbar. */
    height: 2.1,
    postRadius: 0.085,
    /** Length of the corner collider that counts as the junction, per side. */
    junctionLength: 0.42,
    /** How deep the net box reaches behind the line. */
    depth: 1.5,
  },

  ball: {
    radius: 0.112,
    mass: 0.43,
    restitution: 0.62,
    friction: 0.55,
    /** Linear damping, roughly models air + rolling resistance. */
    linearDamping: 0.35,
    angularDamping: 0.45,
    maxSpeed: 32,
    /** Ball is considered controllable by a player inside this radius. */
    controlRadius: 1.4,
    /** Dribble steering strength while in control. */
    dribbleForce: 15,
    /** Max speed the dribble nudge will push the ball to. */
    dribbleMaxSpeed: 9.5,
    /**
     * Ball control assist: a gentle pull towards the controlling player's feet.
     * Deliberately weak — it must never glue the ball to the foot.
     */
    assistStrength: 3.4,
    /** Assist fades out beyond this fraction of the control radius. */
    assistFalloff: 0.55,
  },

  player: {
    radius: 0.35,
    height: 1.78,
    mass: 76,
    walkSpeed: 5.3,
    sprintSpeed: 8.1,
    acceleration: 26,
    deceleration: 34,
    /** Radians per second of body rotation. */
    turnRate: 11,
    staminaMax: 100,
    staminaDrainPerSecond: 26,
    staminaRegenPerSecond: 17,
    /** Sprinting is refused below this stamina value. */
    staminaSprintFloor: 8,
  },

  kick: {
    /** Seconds of holding to reach full power. */
    chargeSeconds: 0.95,
    minPower: 0.18,
    /** Impulse magnitude at power 1.0 for a flat shot. */
    maxImpulse: 9.4,
    /** Fraction of the impulse redirected upwards on a lofted shot. */
    loftRatio: 0.62,
    /** Small permanent lift so flat shots still leave the ground slightly. */
    flatLift: 0.08,
    /** The ball must be this close to be kickable. */
    range: 1.6,
    /** Movement speed multiplier while a shot is being charged. */
    chargeMoveScale: 0.7,
    /**
     * A short, readable wind-up before the foot meets the ball. The impulse is
     * applied when it elapses, so the animation and the physics agree.
     */
    windUpSeconds: 0.09,
    /** Half-angle (radians) of the cone in front of the player that can be kicked. */
    coneHalfAngle: 1.15,
    cooldownSeconds: 0.35,
  },

  tackle: {
    range: 2,
    cooldownSeconds: 1.1,
    /** Impulse applied to the ball when a tackle succeeds. */
    ballImpulse: 3.4,
    /** Seconds the dispossessed player cannot control the ball. */
    stunSeconds: 0.45,
    /** Chance the tackle takes the ball cleanly rather than just poking it. */
    successChance: 0.75,
    /** A missed tackle costs more than a successful one, to discourage spam. */
    missCooldownSeconds: 1.6,
  },

  /** Aim assist nudges a shot towards the goal mouth. Weak, and switchable off. */
  aimAssist: {
    /** Maximum correction in radians for a pad or touch player. */
    maxAngle: 0.16,
    /** Assist only applies inside this distance from the target goal. */
    range: 18,
    /** Keyboard players already aim precisely, so they get less help. */
    keyboardScale: 0.35,
  },

  camera: {
    distance: 9.2,
    height: 4.6,
    lookAtHeight: 1.1,
    /** 0..1 per tick smoothing factor for position and target. */
    positionSmoothing: 0.12,
    targetSmoothing: 0.18,
    fov: 0.95,
    minFov: 0.82,
    maxFov: 1.22,
    /** Keeps the camera from clipping through the perimeter walls. */
    collisionPadding: 0.6,
    /** Shake amplitude in metres at full strength, before the player's setting. */
    shakeAmplitude: 0.26,
    shakeDecayPerSecond: 5.5,
    shakeScale: { off: 0, subtle: 0.45, normal: 1 } as const,
    /** How strongly the view leans towards the ball rather than the goal. */
    ballAwarenessWeight: 0.22,
    /**
     * Hard cap, in radians, on how far the view may swing off the line to the
     * attacking goal. Without it a ball in the corner rotates the goal out of
     * frame, which is exactly when the player needs to see it.
     */
    maxYawDeviation: 0.42,
  },

  /** The shared camera used when two humans play on one device. */
  sharedCamera: {
    /** Both players and the ball must stay inside this fraction of the screen. */
    safeFrame: 0.72,
    minDistance: 9,
    maxDistance: 19.5,
    minHeight: 4.6,
    maxHeight: 9.4,
    /** How much of the framing weight the ball carries versus the players. */
    ballWeight: 0.44,
    positionSmoothing: 0.1,
    targetSmoothing: 0.14,
    distanceSmoothing: 0.07,
    /** Extra lean towards the goal the move is developing against. */
    goalBias: 0.18,
    /** Brief pull-in after a scoring event. */
    celebrationZoom: 0.82,
    /**
     * Separation, in metres, up to which BOTH players and the ball are
     * guaranteed inside the safe frame. Beyond it the distance and field-of-view
     * ceilings bind, and the camera keeps the ball framed while a player may
     * drift off the edge — the alternative is a camera so far back that both
     * players become specks. Measured, not guessed: see tests/sharedCamera.
     */
    framableSeparation: 20,
  },

  /** Visual effects. Every one of these is scaled down by the quality preset. */
  effects: {
    /** Ball trail only appears above this speed. */
    trailMinSpeed: 15,
    trailSegments: 14,
    trailFadeSeconds: 0.28,
    /** Dust puffs on hard stops, sprint starts and kicks. */
    dustPoolSize: 48,
    dustLifeSeconds: 0.5,
    dustRiseSpeed: 1.1,
    /** How long a struck goal frame glows. */
    frameFlashSeconds: 0.55,
    /** Confetti-free celebration: a short ring pulse on the pitch. */
    celebrationSeconds: 1.1,
  },

  /** Procedural animation timings, in seconds. */
  animation: {
    blendSeconds: 0.14,
    kickSeconds: 0.32,
    tackleSeconds: 0.42,
    celebrationSeconds: 1.8,
    /** Strides per second at walking and at sprinting pace. */
    walkStrideRate: 5,
    sprintStrideRate: 14,
  },

  difficulty: {
    easy: {
      reactionTime: 0.42,
      speedMultiplier: 0.84,
      aimError: 0.2,
      powerJitter: 0.3,
      tackleAggression: 0.3,
      shootingRange: 11,
    },
    normal: {
      reactionTime: 0.26,
      speedMultiplier: 0.95,
      aimError: 0.12,
      powerJitter: 0.18,
      tackleAggression: 0.55,
      shootingRange: 13.5,
    },
    hard: {
      reactionTime: 0.14,
      speedMultiplier: 1.03,
      aimError: 0.06,
      powerJitter: 0.1,
      tackleAggression: 0.8,
      shootingRange: 16,
    },
  } as const satisfies Record<Difficulty, DifficultyProfile>,

  quality: {
    low: {
      shadows: false,
      shadowMapSize: 512,
      maxPixelRatio: 1,
      antialias: false,
      sceneryDetail: 0,
    },
    medium: {
      shadows: true,
      shadowMapSize: 1024,
      maxPixelRatio: 1.5,
      antialias: true,
      sceneryDetail: 1,
    },
    high: {
      shadows: true,
      shadowMapSize: 2048,
      maxPixelRatio: 2,
      antialias: true,
      sceneryDetail: 2,
    },
  } as const satisfies Record<QualityLevel, QualityProfile>,

  /**
   * Kit colours. Each has a distinct hue AND a distinct shirt pattern, so the
   * teams stay tellable apart without relying on colour vision.
   */
  kits: [
    { id: 0, name: 'כתום', shirt: '#ff8c1a', trim: '#1b1c20', pattern: 'solid' },
    { id: 1, name: 'כחול', shirt: '#2f7fe8', trim: '#f2f5f9', pattern: 'stripes' },
    { id: 2, name: 'לבן', shirt: '#f2f4f7', trim: '#22242a', pattern: 'sash' },
    { id: 3, name: 'ירוק', shirt: '#2fae6a', trim: '#10231a', pattern: 'hoops' },
  ] as const,

  audio: {
    masterVolumeDefault: 0.8,
    musicVolumeDefault: 0.35,
    /** Vibration patterns in milliseconds, by event. */
    vibration: {
      kick: 18,
      post: 45,
      crossbar: 55,
      junction: [40, 40, 90],
      goal: [30, 50, 120],
      whistle: 90,
    },
  },

  input: {
    /** Dead zone of the virtual joystick and gamepad sticks, 0..1. */
    deadZone: 0.16,
    deadZoneMin: 0.05,
    deadZoneMax: 0.4,
    joystickRadiusPx: 62,
    sensitivityDefault: 1,
    sensitivityMin: 0.5,
    sensitivityMax: 2,
  },

  physics: {
    gravity: -13.8,
    /**
     * Physics substeps per simulation tick. Havok exposes no continuous collision
     * detection here, so the guard against a fast ball tunnelling through a wall is
     * a smaller step: 2 substeps => 120Hz => at most ~0.27m of travel per substep,
     * well under the wall thickness. Fixed (not adaptive) so the result stays
     * reproducible for a future authoritative server.
     */
    substeps: 2,
  },
} as const;

export type GameConfigType = typeof GameConfig;

/** Points awarded for a scoring event kind. */
export function pointsFor(kind: ScoreKind): number {
  return GameConfig.match.points[kind];
}

/** Maps a goal frame part to the kind of scoring event it produces. */
export function kindForGoalPart(part: GoalPart): ScoreKind {
  switch (part) {
    case 'leftJunction':
    case 'rightJunction':
      return 'junction';
    case 'crossbar':
      return 'crossbar';
    case 'leftPost':
    case 'rightPost':
      return 'post';
  }
}

/** Lower number means higher priority when several events belong to one shot. */
export function priorityOf(kind: ScoreKind): number {
  const index = GameConfig.scoring.priority.indexOf(kind);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

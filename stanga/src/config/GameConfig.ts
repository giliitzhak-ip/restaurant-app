/**
 * GameConfig — the single source of truth for every tunable number in STANGA.
 * Nothing in the codebase is allowed to hard-code gameplay values; import from here.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
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
  /**
   * How far ahead the AI is allowed to predict the ball, in seconds.
   *
   * This is most of what a difficulty setting actually is. An easy opponent
   * barely looks past the present and arrives where the ball was; a hard one
   * reads the flight and is standing there when it comes down.
   */
  readonly predictionSeconds: number;
  /** Chance per plan of going for the frame rather than the net. */
  readonly frameHuntChance: number;
  /** Chance per plan of putting the ball in the air. */
  readonly loftChance: number;
}

/** The five shapes a player can select before striking. */
export type ShotStyle = 'flat' | 'normal' | 'lofted' | 'curled' | 'chip';

/** The order the shot-style control cycles through. */
export const SHOT_STYLE_ORDER: readonly ShotStyle[] = [
  'normal',
  'flat',
  'lofted',
  'curled',
  'chip',
];

export interface ShotStyleProfile {
  /** Where inside the 5°..50° range this style starts, 0..1. */
  readonly elevationBias: number;
  /** How much of that range the player's aim still sweeps, 0..1. */
  readonly elevationScale: number;
  readonly speedScale: number;
  /** Ceiling on the charge this style will use. */
  readonly powerCap: number;
  readonly spinScale: number;
  /**
   * Least spin this style puts on the ball, as a fraction of the maximum.
   * Selecting "curled" and getting no curl because no direction was asked for
   * would make the style a label rather than a shot.
   */
  readonly spinFloor: number;
}

export interface QualityProfile {
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly maxPixelRatio: number;
  /** Anti-aliasing for the render target. */
  readonly antialias: boolean;
  /** Extra scenery detail (fences, props, crowd silhouettes). */
  readonly sceneryDetail: number;
  /**
   * Image-based lighting: a cube map of the sky, captured once, that lights
   * every PBR surface. Off means the materials fall back to the two lights
   * alone, which is flatter but a good deal cheaper.
   */
  readonly imageBasedLighting: boolean;
  /** Post-processing chain: tone mapping, bloom, vignette, sharpening. */
  readonly postProcessing: boolean;
  readonly bloom: boolean;
  /** Screen-space ambient occlusion. The most expensive thing here. */
  readonly ambientOcclusion: boolean;
  /** How many spectators are instanced around the fence. 0 disables them. */
  readonly crowdCount: number;
  /**
   * Distance in metres past which scenery swaps to its cheap level of detail.
   * Smaller is cheaper.
   */
  readonly lodDistance: number;
  /** A rough frame-time budget in milliseconds, shown on the graphics screen. */
  readonly frameBudgetMs: number;
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
    /** Freeze after a double-touch call, long enough to read the banner. */
    violationFreezeSeconds: 1.3,
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

  /**
   * The STANGA touch rule: one meaningful touch per turn, juggling excepted.
   * See docs/touch-rule.md.
   */
  touch: {
    /** Below this relative speed at contact, it is noise rather than a touch. */
    minRelativeSpeed: 1.1,
    /** One whistle per scramble, not one per frame. */
    violationCooldownTicks: 30,
    /**
     * Ticks before the same player's capsule can register another contact.
     * A kick is modelled as an impulse, so the foot usually keeps touching the
     * ball for a few ticks afterwards; without this that would read as juggling.
     */
    contactDebounceTicks: 9,
    /** Ball height above the surface below which a bounce counts as grounded. */
    groundContactHeight: 0.02,
    /** Speed a controlled first touch gives the ball, m/s. */
    firstTouchSpeed: 4.2,
    /** Small lift on a first touch, as a fraction of its speed. */
    firstTouchLift: 0.18,
    /** How far from the goal line a violation restart is placed, in metres. */
    restartGoalMargin: 4,
    /**
     * Seconds a stationary ball may sit before the turn is officially reopened.
     *
     * The rule says the turn comes back on somebody else's touch "or on an
     * official restart", and this is that restart. Without it a one-on-one
     * against a player who simply does not come for the ball deadlocks: the
     * last toucher may not play it again, nobody else will, and the match
     * stands still. Measured: an opponent spent 82% of a minute backing away
     * from a ball it was not allowed to touch.
     */
    staleSeconds: 3.5,
    /** Ball speed under which it counts as sitting still, m/s. */
    staleSpeed: 0.9,
  },

  ball: {
    radius: 0.112,
    mass: 0.43,
    restitution: 0.62,
    friction: 0.55,
    /**
     * Havok's own damping, now almost nothing.
     *
     * It used to be 0.35, which bled the same fraction out of every component
     * of the velocity whatever the ball was doing — so a ball in flight was
     * slowed as if it were dragging along the asphalt, and a lofted ball fell
     * out of the sky. Air drag and rolling resistance are separate forces with
     * different laws, and they are modelled separately below. What is left
     * here is a trace, to stop a ball jittering forever on a flat surface.
     */
    linearDamping: 0.02,
    angularDamping: 0.12,
    maxSpeed: 32,
    /**
     * Quadratic air drag, in 1/m: dv = -airDrag * |v| * v * dt.
     *
     * Derived rather than dialled: 0.5 * rho * Cd * A / m with air at
     * 1.2 kg/m^3, a sphere's Cd of 0.25, this ball's cross-section and its
     * mass. It is what makes a hard shot lose its edge over a long flight and
     * a floated one hang.
     */
    airDrag: 0.0137,
    /**
     * Rolling resistance on the surface, in 1/s, on top of the air drag.
     *
     * Measured rather than guessed: at 0.85 a ball struck at 26 m/s was down
     * to 7 by the time it reached a goal seventeen metres away, so a pass
     * died before it arrived. This lets a firm ball cross the pitch and still
     * brings a loose one to a stop.
     */
    rollingResistance: 0.28,
    /** Above this height over the surface the ball is flying, not rolling. */
    airborneHeight: 0.17,
    /** Side spin bleeds away in flight, in 1/s. */
    spinDecay: 0.5,
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
    /**
     * How stiffly two team-mates who overlap push each other apart, in
     * newtons per metre of overlap. Team-mates do not collide as solid
     * capsules — four people around one ball turns into a scrum — so this
     * spring is the whole of their separation, and `MatchConfig.friendlyCollision`
     * scales it per mode.
     */
    friendlySeparation: 900,
    /** Ceiling on the separation speed, so an overlap cannot launch anyone. */
    friendlySeparationMaxSpeed: 2.6,
  },

  kick: {
    /** Seconds of holding to reach full power. */
    chargeSeconds: 0.95,
    /**
     * A press shorter than this is a tap, not a charge.
     *
     * Without it the shortest possible press still fired at `minPower` along
     * whatever height the aim happened to be parked at, so there was no way to
     * just pass the ball forward. A tap is now its own thing: weak, flat, and
     * always the same, whatever the aim says.
     */
    tapSeconds: 0.14,
    tapPower: 0.2,
    minPower: 0.18,
    /**
     * Outgoing ball speed in m/s at power 0 and at power 1.
     *
     * The strike sets the ball's velocity rather than adding an impulse to
     * whatever it was already doing. A foot swinging through a ball dominates
     * the ball's own momentum, and it is the only model in which the same
     * charge and the same aim produce the same shot twice — which is what
     * aiming at a crossbar needs.
     */
    minSpeed: 8,
    maxSpeed: 23.5,
    /**
     * Launch angle limits, in radians: about 5° to about 50°.
     *
     * Below 5° the ball is pressed into the asphalt and just stops; above 50°
     * it is a punt rather than a shot. Everything a player can aim lives
     * between them, and the crossbar sits inside that range from anywhere on
     * this pitch.
     */
    minElevation: (5 * Math.PI) / 180,
    maxElevation: (50 * Math.PI) / 180,
    /** Exponent on the vertical aim. >1 puts the fine control near the ground. */
    elevationCurve: 1.7,
    /**
     * How much pace a steep strike gives up, at the top of the angle range.
     *
     * You cannot get a foot right under a ball and still swing through it at
     * full speed. Without this a full-power lob left at 23 m/s and 47° and
     * peaked at eleven metres — a moonball on a pitch thirty-four long.
     */
    elevationSpeedFalloff: 0.32,
    /**
     * Share of the striker's own ground speed that carries into the shot.
     * Running onto a ball is worth something; it is not worth everything.
     */
    runShare: 0.3,
    /** A ball above this height is struck out of the air: a volley. */
    volleyHeight: 0.38,
    /** A volley is cleaner through the ball, and rises a little more. */
    volleySpeedScale: 1.1,
    volleyElevationBonus: (4 * Math.PI) / 180,
    /**
     * The two ends the flat/high control snaps between.
     *
     * Fine aiming is a held axis, but a game also needs one control that just
     * means "put it in the air" — over a defender, onto a team-mate's head, at
     * the crossbar. These are that control's two positions, and every input
     * device snaps to the same pair so a high ball is the same ball whichever
     * one you are holding.
     */
    highAim: 0.92,
    flatAim: -0.75,
    /**
     * What each selected style does to the aim and the speed.
     *
     * `elevationBias` and `elevationScale` map the player's -1..1 aim onto a
     * window inside the 5°..50° range: flat gets the bottom of it, a chip the
     * top, normal the whole thing. The aim still moves the ball inside the
     * window, so a style is a gear rather than a fixed value.
     */
    styles: {
      flat: {
        elevationBias: 0,
        elevationScale: 0.18,
        speedScale: 1.06,
        powerCap: 1,
        spinScale: 0.4,
        spinFloor: 0,
      },
      normal: {
        elevationBias: 0,
        elevationScale: 1,
        speedScale: 1,
        powerCap: 1,
        spinScale: 1,
        spinFloor: 0,
      },
      lofted: {
        elevationBias: 0.55,
        elevationScale: 0.45,
        speedScale: 0.94,
        powerCap: 1,
        spinScale: 0.8,
        spinFloor: 0,
      },
      curled: {
        elevationBias: 0.12,
        elevationScale: 0.58,
        speedScale: 0.95,
        powerCap: 1,
        spinScale: 1.25,
        spinFloor: 0.55,
      },
      chip: {
        elevationBias: 0.85,
        elevationScale: 0.15,
        speedScale: 0.62,
        powerCap: 0.62,
        spinScale: 0.6,
        spinFloor: 0,
      },
    } as const satisfies Record<ShotStyle, ShotStyleProfile>,
    /** Side spin, in radians per second at full request on a normal strike. */
    maxSpinRate: 16,
    /** Above this spin rate a strike is reported as curled. */
    curlThreshold: 9,
    /** Above this launch angle a strike is reported as lofted. */
    loftedElevation: (24 * Math.PI) / 180,
    /** Above this power a low strike is driven rather than rolled. */
    drivenPowerThreshold: 0.55,
    /**
     * Magnus acceleration coefficient, in 1/rad. The sideways acceleration is
     * this times the spin rate times the ground speed, so the curve develops
     * over the flight instead of bending the ball at the foot.
     *
     * Sized against gravity rather than by eye: at a full curl (20 rad/s) and
     * twenty metres a second it comes to about 3.5 m/s^2, a third of gravity,
     * which bends a long ball by a couple of metres. Anything approaching
     * gravity itself steers the ball round corners instead of bending it.
     */
    magnusCoefficient: 0.0088,
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

  /** A pass is a kick with the server choosing where it goes. */
  pass: {
    /** Ball speed, m/s, on a full-length pass. */
    maxSpeed: 15,
    /** Shortest pass the server will play, in metres. */
    minRange: 1.5,
    /** A ground pass reaches at most this far. */
    maxRange: 16,
    /** Held pass: a ball into space ahead of the receiver. */
    throughMaxRange: 24,
    /** Seconds of holding to reach a full-length through ball. */
    holdSeconds: 0.55,
    /** How far in front of a moving receiver the ball is aimed, in seconds. */
    leadSeconds: 0.35,
    /** Launch angle of a ground pass and of a through ball, in radians. */
    groundElevation: (3.5 * Math.PI) / 180,
    throughElevation: (19 * Math.PI) / 180,
    /** Half-angle of the cone a preferred target must fall inside. */
    coneHalfAngle: 1.4,
    cooldownSeconds: 0.3,
    /** Seconds after a pass in which a score still counts as assisted. */
    assistWindowSeconds: 6,
  },

  /** Flicking the ball up to keep an aerial chain alive. */
  juggle: {
    /** Upward impulse of a flick. */
    lift: 2.15,
    /** Forward impulse, so a chain can carry the ball up the pitch. */
    forward: 1.35,
    /** The ball must be within this distance to be flicked. */
    range: 1.35,
    /** And below this height: you cannot head a ball that is over the bar. */
    maxHeight: 2.2,
    cooldownSeconds: 0.22,
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
     * How far the view pulls in at a full charge, as a fraction of the
     * distance and the height. Small: it should say "this one is loading"
     * without taking the goal out of frame.
     */
    chargeZoom: 0.16,
    chargeHeightPull: 0.1,
    /**
     * Player-driven look.
     *
     * The chase camera picks a sensible angle, but a sensible angle is not
     * always the one you want: you cannot see who is behind you, and you
     * cannot line a shot up from the side. Dragging a finger across the middle
     * of the screen swings the view, and it eases back to the automatic angle
     * once you stop — a held offset that never returns leaves people playing
     * sideways without realising why.
     */
    look: {
      /** Radians of yaw for a drag across the full width of the screen. */
      yawPerScreen: Math.PI * 1.35,
      /** How far the view may be swung either way. */
      maxYaw: Math.PI * 0.85,
      /** Pitch is -1 (low, behind) to 1 (high, looking down). */
      pitchPerScreen: 2.4,
      maxPitch: 0.9,
      /** Height and distance at the two ends of the pitch range, as factors. */
      pitchHeight: 1.55,
      pitchDistance: 0.55,
      /** Seconds of no input before the view starts easing back. */
      recentreDelay: 2.4,
      /** How fast it eases back, in units per second. */
      recentreRate: 0.85,
    },
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
      predictionSeconds: 0.25,
      frameHuntChance: 0.05,
      loftChance: 0.15,
    },
    normal: {
      reactionTime: 0.26,
      speedMultiplier: 0.95,
      aimError: 0.12,
      powerJitter: 0.18,
      tackleAggression: 0.55,
      shootingRange: 13.5,
      predictionSeconds: 0.7,
      frameHuntChance: 0.12,
      loftChance: 0.25,
    },
    hard: {
      reactionTime: 0.14,
      speedMultiplier: 1.03,
      aimError: 0.06,
      powerJitter: 0.1,
      tackleAggression: 0.8,
      shootingRange: 16,
      predictionSeconds: 1.4,
      frameHuntChance: 0.22,
      loftChance: 0.35,
    },
  } as const satisfies Record<Difficulty, DifficultyProfile>,

  quality: {
    low: {
      shadows: false,
      shadowMapSize: 512,
      maxPixelRatio: 1,
      antialias: false,
      sceneryDetail: 0,
      imageBasedLighting: false,
      postProcessing: false,
      bloom: false,
      ambientOcclusion: false,
      crowdCount: 0,
      lodDistance: 26,
      frameBudgetMs: 16.7,
    },
    medium: {
      shadows: true,
      shadowMapSize: 1024,
      maxPixelRatio: 1.5,
      antialias: true,
      sceneryDetail: 1,
      imageBasedLighting: true,
      postProcessing: true,
      bloom: false,
      ambientOcclusion: false,
      crowdCount: 28,
      lodDistance: 40,
      frameBudgetMs: 16.7,
    },
    high: {
      shadows: true,
      shadowMapSize: 2048,
      maxPixelRatio: 2,
      antialias: true,
      sceneryDetail: 2,
      imageBasedLighting: true,
      postProcessing: true,
      bloom: true,
      ambientOcclusion: false,
      crowdCount: 56,
      lodDistance: 70,
      frameBudgetMs: 16.7,
    },
    ultra: {
      shadows: true,
      shadowMapSize: 4096,
      maxPixelRatio: 2,
      antialias: true,
      sceneryDetail: 2,
      imageBasedLighting: true,
      postProcessing: true,
      bloom: true,
      ambientOcclusion: true,
      crowdCount: 96,
      lodDistance: 140,
      frameBudgetMs: 16.7,
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
    /**
     * Real gravity.
     *
     * It was -13.8 to stop a lofted ball hanging, which is treating the
     * symptom: the ball hung because the drag model was wrong, and an
     * over-strong gravity flattened every arc in the game to compensate. With
     * proper air drag the honest number works, and a chip looks like a chip.
     */
    gravity: -9.81,
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

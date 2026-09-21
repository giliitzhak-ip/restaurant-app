/**
 * Arena — the street pitch you can see.
 *
 * The collision geometry (ground, walls, the five colliders per goal frame, net
 * stoppers) is built by `physics/ArenaColliders`, which the server runs too.
 * This file only decorates those very same meshes and adds the purely
 * decorative ones: sky, markings, nets, fence and the neighbourhood.
 */
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, type GoalPart, type QualityProfile } from '../config/GameConfig';
import { Rng } from '../core/Rng';
import type { TeamId } from '../game/MatchState';
import { buildArenaColliders } from '../physics/ArenaColliders';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { createSurface } from './Surfaces';
import {
  createAsphaltBumpTexture,
  createAsphaltRoughnessTexture,
  createAsphaltTexture,
  createBuildingTexture,
  createConcreteTexture,
  createFenceTexture,
  createLineTexture,
  createNetTexture,
  createSkyTexture,
} from './ProceduralTextures';

export interface GoalHandles {
  readonly owner: TeamId;
  readonly parts: Map<GoalPart, Mesh>;
  /**
   * The back panel of the net, built with enough subdivisions to be pushed
   * about. `NetRipple` deforms it when a ball arrives; nothing else touches it.
   */
  readonly netBack: Mesh;
}

/** How finely the back of each net is divided, per axis. */
const NET_SUBDIVISIONS = 10;

export interface ArenaHandles {
  readonly ground: Mesh;
  readonly goals: Map<TeamId, GoalHandles>;
  /** The light QualityManager attaches (or detaches) shadows to. */
  readonly sun: DirectionalLight;
  /** Meshes that should cast shadows once a shadow generator exists. */
  readonly shadowCasters: Mesh[];
  /**
   * What the environment probe captures: the sky and the far backdrop, which
   * is everything whose colour the PBR surfaces should be picking up. Nothing
   * that moves, because the probe renders once.
   */
  readonly environmentSources: Mesh[];
}

export function buildArena(
  scene: Scene,
  world: PhysicsWorld,
  quality: QualityProfile,
): ArenaHandles {
  const { field, goal } = GameConfig;
  const halfLength = field.length / 2;
  const halfWidth = field.width / 2;
  const outerLength = field.length + goal.depth * 2 + field.wallThickness;

  // ── Lighting ────────────────────────────────────────────────────────────────
  /*
   * Lighting for a street pitch in the afternoon.
   *
   * These numbers were raised a long way from where they started, because the
   * scene rendered as a near-black murk: ACES tone mapping pulls the middle of
   * the range down hard, and a dark asphalt albedo under a weak sun lands
   * below the point where anything is readable. The sky above is where all of
   * this has to sit — the reflection probe captures it, so the light and the
   * environment have to agree about the time of day.
   */
  const ambient = new HemisphericLight('ambient', new Vector3(0.2, 1, 0.1), scene);
  ambient.intensity = 1.05;
  ambient.diffuse = Color3.FromHexString('#c9dcf2');
  ambient.groundColor = Color3.FromHexString('#6b6459');

  const sun = new DirectionalLight('sun', new Vector3(-0.55, -1, 0.38), scene);
  sun.position = new Vector3(18, 26, -14);
  sun.intensity = 3.1;
  sun.diffuse = Color3.FromHexString('#fff0d6');
  sun.specular = Color3.FromHexString('#fffaf0');

  sun.shadowMinZ = 6;
  sun.shadowMaxZ = 70;

  /*
   * A fill from the opposite side, casting nothing.
   *
   * One key light and a hemispheric ambient give a body two tones: a lit side
   * and a flat one. The shaded side of a player on a real pitch is not flat —
   * it is picking up the sky and the bounce off pale concrete, and that second
   * gradient is most of what makes a shape read as round. It is a quarter the
   * strength of the sun and cool against its warmth, and it deliberately has
   * no shadow map: a second set of shadows would be both wrong and expensive.
   */
  const fill = new DirectionalLight('fill', new Vector3(0.62, -0.55, -0.42), scene);
  fill.position = new Vector3(-20, 15, 16);
  fill.intensity = 0.78;
  fill.diffuse = Color3.FromHexString('#b9d2ef');
  fill.specular = Color3.FromHexString('#93b4dc');

  // ── Sky dome ────────────────────────────────────────────────────────────────
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 260, segments: 16 }, scene);
  const skyMaterial = new StandardMaterial('skyMat', scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableLighting = true;
  skyMaterial.emissiveTexture = createSkyTexture(scene);
  skyMaterial.diffuseColor = Color3.Black();
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  // ── Collision geometry, shared with the server ──────────────────────────────
  const colliders = buildArenaColliders(scene, world);

  // ── Ground ──────────────────────────────────────────────────────────────────
  const { ground } = colliders;
  const asphalt = createAsphaltTexture(scene);
  asphalt.uScale = 7;
  asphalt.vScale = 11;
  const bump = createAsphaltBumpTexture(scene);
  bump.uScale = 12;
  bump.vScale = 18;
  const asphaltRoughness = createAsphaltRoughnessTexture(scene);
  asphaltRoughness.uScale = 7;
  asphaltRoughness.vScale = 11;
  ground.material = createSurface(scene, 'groundMat', {
    roughness: 0.86,
    albedoTexture: asphalt,
    bumpTexture: bump,
    metallicRoughnessTexture: asphaltRoughness,
    ambientLift: 0.16,
  });
  ground.receiveShadows = true;

  // Painted markings as a thin overlay plane.
  const lines = MeshBuilder.CreateGround(
    'lines',
    { width: field.width - field.lineInset * 2, height: field.length - field.lineInset * 2 },
    scene,
  );
  lines.position.y = 0.012;
  lines.isPickable = false;
  const lineTexture = createLineTexture(
    scene,
    (field.length - field.lineInset * 2) / (field.width - field.lineInset * 2),
  );
  lineTexture.hasAlpha = true;
  const lineMaterial = createSurface(scene, 'lineMat', {
    // Old paint on rough ground: no sheen of its own.
    roughness: 0.92,
    albedoTexture: lineTexture,
    opacityTexture: lineTexture,
    ambientLift: 0.35,
  });
  lineMaterial.zOffset = -2;
  lines.material = lineMaterial;

  // ── Perimeter ───────────────────────────────────────────────────────────────
  const concrete = createConcreteTexture(scene);
  concrete.uScale = 14;
  const concreteMaterial = createSurface(scene, 'concreteMat', {
    roughness: 0.94,
    albedoTexture: concrete,
    ambientLift: 0.14,
  });

  const shadowCasters: Mesh[] = [];

  for (const wall of colliders.walls) {
    wall.material = concreteMaterial;
    wall.receiveShadows = true;
  }

  // Chain-link fence above the concrete, purely decorative.
  const fenceTexture = createFenceTexture(scene);
  fenceTexture.uScale = 14;
  fenceTexture.vScale = 2;
  const fenceMaterial = createSurface(scene, 'fenceMat', {
    // Galvanised wire: metal, but dull and weathered.
    roughness: 0.55,
    metallic: 0.75,
    albedoTexture: fenceTexture,
    opacityTexture: fenceTexture,
    backFaceCulling: false,
    ambientLift: 0.2,
  });

  const fenceHeight = 2.4;
  for (const sign of [-1, 1]) {
    const fence = MeshBuilder.CreatePlane(
      `fence${sign}`,
      { width: outerLength, height: fenceHeight },
      scene,
    );
    fence.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    fence.position.set(
      sign * (halfWidth + field.wallThickness / 2),
      field.wallHeight + fenceHeight / 2,
      0,
    );
    fence.material = fenceMaterial;
    fence.isPickable = false;
  }

  // ── Goals ───────────────────────────────────────────────────────────────────
  const goals = new Map<TeamId, GoalHandles>();
  // Painted steel: smooth enough to catch the sun down one side of a post,
  // which is what makes a crossbar readable against a bright sky.
  const frameMaterial = createSurface(scene, 'frameMat', {
    roughness: 0.28,
    metallic: 0.35,
    albedoColor: '#e9ecef',
    ambientLift: 0.2,
  });

  const junctionMaterial = createSurface(scene, 'junctionMat', {
    roughness: 0.22,
    metallic: 0.45,
    albedoColor: '#ffa524',
    emissiveColor: '#40290a',
    ambientLift: 0.25,
  });

  const netTexture = createNetTexture(scene);
  netTexture.uScale = 6;
  netTexture.vScale = 4;
  const netMaterial = createSurface(scene, 'netMat', {
    roughness: 0.85,
    albedoTexture: netTexture,
    opacityTexture: netTexture,
    backFaceCulling: false,
    ambientLift: 0.3,
  });

  for (const owner of ['home', 'away'] as const) {
    const sign = owner === 'home' ? -1 : 1;
    const goalZ = sign * halfLength;
    const collider = colliders.goals.get(owner);
    if (!collider) continue;
    const parts = collider.parts;

    const postX = goal.width / 2 + goal.postRadius;

    for (const [part, mesh] of parts) {
      mesh.material = part.endsWith('Junction') ? junctionMaterial : frameMaterial;
      mesh.receiveShadows = true;
      shadowCasters.push(mesh);
    }

    // Net: back panel, two sides and a roof. Purely visual except for the stopper.
    const netBackZ = goalZ + sign * goal.depth;
    // Subdivided, because it has to bulge: a flat quad cannot take a ball.
    const netBack = MeshBuilder.CreateGround(
      `${owner}-netBack`,
      {
        width: goal.width + goal.postRadius * 2,
        height: goal.height,
        subdivisionsX: NET_SUBDIVISIONS,
        subdivisionsY: NET_SUBDIVISIONS,
        updatable: true,
      },
      scene,
    );
    // Built flat, then stood up: a ground gives the subdivisions a plane does
    // not, and standing it up is one rotation.
    netBack.rotation.x = -Math.PI / 2;
    netBack.rotation.y = sign > 0 ? Math.PI : 0;
    netBack.position.set(0, goal.height / 2, netBackZ);
    netBack.material = netMaterial;
    netBack.isPickable = false;

    for (const side of [-1, 1]) {
      const netSide = MeshBuilder.CreatePlane(
        `${owner}-netSide${side}`,
        { width: goal.depth, height: goal.height },
        scene,
      );
      netSide.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      netSide.position.set(side * postX, goal.height / 2, goalZ + (sign * goal.depth) / 2);
      netSide.material = netMaterial;
      netSide.isPickable = false;
    }

    // Back stays: the two struts that hold a real frame up, running from the
    // top corners down to the foot of the net. Cheap, and they are the detail
    // that stops the goal reading as three sticks and a curtain.
    for (const side of [-1, 1]) {
      const stayLength = Math.hypot(goal.depth, goal.height);
      const stay = MeshBuilder.CreateCylinder(
        `${owner}-stay${side}`,
        { diameter: goal.postRadius * 1.4, height: stayLength, tessellation: 8 },
        scene,
      );
      stay.position.set(side * postX, goal.height / 2, goalZ + (sign * goal.depth) / 2);
      stay.rotation.x = Math.atan2(goal.depth, goal.height) * sign;
      stay.material = frameMaterial;
      stay.isPickable = false;
      stay.receiveShadows = true;
      shadowCasters.push(stay);
    }

    const netRoof = MeshBuilder.CreateGround(
      `${owner}-netRoof`,
      { width: goal.width + goal.postRadius * 2, height: goal.depth },
      scene,
    );
    netRoof.position.set(0, goal.height, goalZ + (sign * goal.depth) / 2);
    netRoof.material = netMaterial;
    netRoof.isPickable = false;

    goals.set(owner, { owner, parts, netBack });
  }

  // ── Neighbourhood backdrop ──────────────────────────────────────────────────
  const environmentSources: Mesh[] = [sky];
  if (quality.sceneryDetail > 0) {
    environmentSources.push(...buildNeighbourhood(scene, quality.sceneryDetail));
  }

  // Just enough haze to separate the backdrop from the pitch, in a daylight
  // colour: a dark fog on a bright scene reads as dirt on the lens.
  scene.fogMode = 2; // FOGMODE_EXP
  scene.fogDensity = 0.0048;
  scene.fogColor = Color3.FromHexString('#bcd0e2');

  return { ground, goals, sun, shadowCasters, environmentSources };
}

/**
 * Apartment blocks, lamp posts and parked-car silhouettes around the pitch.
 * Returns the meshes worth capturing into the environment probe.
 */
function buildNeighbourhood(scene: Scene, detail: number): Mesh[] {
  const backdrop: Mesh[] = [];
  const rng = new Rng(0xb00b1e5);
  const { field } = GameConfig;
  const halfWidth = field.width / 2;
  const halfLength = field.length / 2;

  const blockCount = detail >= 2 ? 16 : 9;
  for (let i = 0; i < blockCount; i += 1) {
    const height = rng.range(9, 26);
    const width = rng.range(7, 14);
    const depth = rng.range(7, 13);
    const building = MeshBuilder.CreateBox(`building-${i}`, { width, height, depth }, scene);
    const onSide = i % 2 === 0;
    const away = rng.range(13, 34);
    building.position.set(
      onSide ? (i % 4 < 2 ? -1 : 1) * (halfWidth + away) : rng.range(-halfWidth - 6, halfWidth + 6),
      height / 2,
      onSide
        ? rng.range(-halfLength - 10, halfLength + 10)
        : (i % 4 < 2 ? -1 : 1) * (halfLength + away),
    );
    building.rotation.y = rng.jitter(0.14);
    const material = new StandardMaterial(`buildingMat-${i}`, scene);
    const texture = createBuildingTexture(scene, 0x1000 + i * 977, detail >= 2 ? 512 : 256);
    texture.uScale = Math.max(1, Math.round(width / 5));
    texture.vScale = Math.max(1, Math.round(height / 5));
    material.diffuseTexture = texture;
    material.specularColor = new Color3(0.04, 0.04, 0.05);
    building.material = material;
    building.isPickable = false;
    backdrop.push(building);
  }

  // Floodlight poles in the corners.
  const poleMaterial = new StandardMaterial('poleMat', scene);
  poleMaterial.diffuseColor = Color3.FromHexString('#3a3d42');
  poleMaterial.specularColor = new Color3(0.3, 0.3, 0.32);

  const lampMaterial = new StandardMaterial('lampMat', scene);
  // Daylight: the floodlights are off, so the heads are grey glass and metal
  // rather than glowing boxes.
  lampMaterial.emissiveColor = Color3.FromHexString('#20242a');
  lampMaterial.diffuseColor = Color3.FromHexString('#aab3bd');
  lampMaterial.specularColor = new Color3(0.5, 0.5, 0.52);

  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const pole = MeshBuilder.CreateCylinder(
        `pole-${x}-${z}`,
        { height: 8.5, diameter: 0.22, tessellation: 8 },
        scene,
      );
      pole.position.set(x * (halfWidth + 1.4), 4.25, z * (halfLength * 0.72));
      pole.material = poleMaterial;
      pole.isPickable = false;

      const lamp = MeshBuilder.CreateBox(
        `lamp-${x}-${z}`,
        { width: 0.9, height: 0.28, depth: 0.6 },
        scene,
      );
      lamp.position.set(x * (halfWidth + 1.1), 8.5, z * (halfLength * 0.72));
      lamp.material = lampMaterial;
      lamp.isPickable = false;
      backdrop.push(pole, lamp);
    }
  }

  return backdrop;
}

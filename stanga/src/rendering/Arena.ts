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
import {
  createAsphaltBumpTexture,
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
}

export interface ArenaHandles {
  readonly ground: Mesh;
  readonly goals: Map<TeamId, GoalHandles>;
  /** The light QualityManager attaches (or detaches) shadows to. */
  readonly sun: DirectionalLight;
  /** Meshes that should cast shadows once a shadow generator exists. */
  readonly shadowCasters: Mesh[];
}

const ACCENT = Color3.FromHexString('#ffa524');

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
  const ambient = new HemisphericLight('ambient', new Vector3(0.2, 1, 0.1), scene);
  ambient.intensity = 0.62;
  ambient.diffuse = Color3.FromHexString('#cfd6e2');
  ambient.groundColor = Color3.FromHexString('#4a453f');

  const sun = new DirectionalLight('sun', new Vector3(-0.55, -1, 0.38), scene);
  sun.position = new Vector3(18, 26, -14);
  sun.intensity = 1.35;
  sun.diffuse = Color3.FromHexString('#ffe8c4');
  sun.specular = Color3.FromHexString('#fff3dd');

  sun.shadowMinZ = 6;
  sun.shadowMaxZ = 70;

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
  const groundMaterial = new StandardMaterial('groundMat', scene);
  const asphalt = createAsphaltTexture(scene);
  asphalt.uScale = 4;
  asphalt.vScale = 6;
  groundMaterial.diffuseTexture = asphalt;
  const bump = createAsphaltBumpTexture(scene);
  bump.uScale = 12;
  bump.vScale = 18;
  groundMaterial.bumpTexture = bump;
  groundMaterial.specularColor = new Color3(0.14, 0.14, 0.15);
  groundMaterial.specularPower = 28;
  ground.material = groundMaterial;
  ground.receiveShadows = true;

  // Painted markings as a thin overlay plane.
  const lines = MeshBuilder.CreateGround(
    'lines',
    { width: field.width - field.lineInset * 2, height: field.length - field.lineInset * 2 },
    scene,
  );
  lines.position.y = 0.012;
  lines.isPickable = false;
  const lineMaterial = new StandardMaterial('lineMat', scene);
  const lineTexture = createLineTexture(
    scene,
    (field.length - field.lineInset * 2) / (field.width - field.lineInset * 2),
  );
  lineTexture.hasAlpha = true;
  lineMaterial.diffuseTexture = lineTexture;
  lineMaterial.opacityTexture = lineTexture;
  lineMaterial.specularColor = Color3.Black();
  lineMaterial.emissiveColor = new Color3(0.18, 0.18, 0.19);
  lineMaterial.zOffset = -2;
  lines.material = lineMaterial;

  // ── Perimeter ───────────────────────────────────────────────────────────────
  const concreteMaterial = new StandardMaterial('concreteMat', scene);
  const concrete = createConcreteTexture(scene);
  concrete.uScale = 8;
  concreteMaterial.diffuseTexture = concrete;
  concreteMaterial.specularColor = new Color3(0.06, 0.06, 0.06);

  const shadowCasters: Mesh[] = [];

  for (const wall of colliders.walls) {
    wall.material = concreteMaterial;
    wall.receiveShadows = true;
  }

  // Chain-link fence above the concrete, purely decorative.
  const fenceMaterial = new StandardMaterial('fenceMat', scene);
  const fenceTexture = createFenceTexture(scene);
  fenceTexture.uScale = 14;
  fenceTexture.vScale = 2;
  fenceMaterial.diffuseTexture = fenceTexture;
  fenceMaterial.opacityTexture = fenceTexture;
  fenceMaterial.backFaceCulling = false;
  fenceMaterial.specularColor = new Color3(0.2, 0.2, 0.22);

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
  const frameMaterial = new StandardMaterial('frameMat', scene);
  frameMaterial.diffuseColor = Color3.FromHexString('#e9ecef');
  frameMaterial.specularColor = new Color3(0.7, 0.7, 0.72);
  frameMaterial.specularPower = 64;

  const junctionMaterial = new StandardMaterial('junctionMat', scene);
  junctionMaterial.diffuseColor = ACCENT;
  junctionMaterial.emissiveColor = ACCENT.scale(0.25);
  junctionMaterial.specularColor = new Color3(0.8, 0.7, 0.4);

  const netMaterial = new StandardMaterial('netMat', scene);
  const netTexture = createNetTexture(scene);
  netTexture.uScale = 6;
  netTexture.vScale = 4;
  netMaterial.diffuseTexture = netTexture;
  netMaterial.opacityTexture = netTexture;
  netMaterial.backFaceCulling = false;
  netMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

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
    const netBack = MeshBuilder.CreatePlane(
      `${owner}-netBack`,
      { width: goal.width + goal.postRadius * 2, height: goal.height },
      scene,
    );
    netBack.position.set(0, goal.height / 2, netBackZ);
    netBack.rotation.y = sign > 0 ? Math.PI : 0;
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

    const netRoof = MeshBuilder.CreateGround(
      `${owner}-netRoof`,
      { width: goal.width + goal.postRadius * 2, height: goal.depth },
      scene,
    );
    netRoof.position.set(0, goal.height, goalZ + (sign * goal.depth) / 2);
    netRoof.material = netMaterial;
    netRoof.isPickable = false;

    goals.set(owner, { owner, parts });
  }

  // ── Neighbourhood backdrop ──────────────────────────────────────────────────
  if (quality.sceneryDetail > 0) {
    buildNeighbourhood(scene, quality.sceneryDetail);
  }

  scene.fogMode = 2; // FOGMODE_EXP
  scene.fogDensity = 0.0065;
  scene.fogColor = Color3.FromHexString('#7c8494');

  return { ground, goals, sun, shadowCasters };
}

/** Apartment blocks, lamp posts and parked-car silhouettes around the pitch. */
function buildNeighbourhood(scene: Scene, detail: number): void {
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
  }

  // Floodlight poles in the corners.
  const poleMaterial = new StandardMaterial('poleMat', scene);
  poleMaterial.diffuseColor = Color3.FromHexString('#3a3d42');
  poleMaterial.specularColor = new Color3(0.3, 0.3, 0.32);

  const lampMaterial = new StandardMaterial('lampMat', scene);
  lampMaterial.emissiveColor = Color3.FromHexString('#ffeabf');
  lampMaterial.diffuseColor = Color3.FromHexString('#ffeabf');

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
    }
  }
}

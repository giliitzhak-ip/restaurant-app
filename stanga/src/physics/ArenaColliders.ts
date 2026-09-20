/**
 * The pitch as the *simulation* sees it: ground, perimeter walls, the two goal
 * frames (five separate colliders each) and the net stoppers.
 *
 * This file is deliberately free of materials, textures and lights so it runs
 * unchanged inside the authoritative server on Babylon's NullEngine. The client
 * calls it through `rendering/Arena`, which then decorates the very same meshes.
 * Keeping the collision geometry in exactly one place is what stops the server
 * and the client from ever disagreeing about where a post is.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, type GoalPart } from '../config/GameConfig';
import type { TeamId } from '../game/MatchState';
import type { PhysicsWorld } from './PhysicsWorld';

export interface GoalColliders {
  readonly owner: TeamId;
  readonly parts: Map<GoalPart, Mesh>;
  /** Invisible box that keeps a scored ball inside the net. */
  readonly stopper: Mesh;
}

export interface ArenaColliders {
  readonly ground: Mesh;
  readonly walls: Mesh[];
  readonly goals: Map<TeamId, GoalColliders>;
}

function staticAggregate(
  mesh: Mesh,
  type: PhysicsShapeType,
  scene: Scene,
  friction: number,
  restitution: number,
): PhysicsAggregate {
  return new PhysicsAggregate(mesh, type, { mass: 0, friction, restitution }, scene);
}

export function buildArenaColliders(scene: Scene, world: PhysicsWorld): ArenaColliders {
  const { field, goal } = GameConfig;
  const halfLength = field.length / 2;
  const halfWidth = field.width / 2;
  const outerLength = field.length + goal.depth * 2 + field.wallThickness;

  // ── Ground ──────────────────────────────────────────────────────────────────
  const ground = MeshBuilder.CreateBox(
    'ground',
    { width: field.width, height: 1, depth: outerLength },
    scene,
  );
  ground.position.y = -0.5;
  const groundAggregate = staticAggregate(ground, PhysicsShapeType.BOX, scene, 0.72, 0.28);
  // Tagged and reporting contacts: the touch rule needs to know the exact tick
  // the ball meets the surface, because that is what ends a juggle.
  groundAggregate.body.setCollisionCallbackEnabled(true);
  world.tag(groundAggregate.body, { kind: 'ground' });

  // ── Perimeter ───────────────────────────────────────────────────────────────
  const walls: Mesh[] = [];
  const addWall = (
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
  ): Mesh => {
    const wall = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    wall.position.set(x, y, z);
    const aggregate = staticAggregate(wall, PhysicsShapeType.BOX, scene, 0.4, 0.45);
    world.tag(aggregate.body, { kind: 'wall' });
    walls.push(wall);
    return wall;
  };

  const sideWallY = field.wallHeight / 2;
  addWall(
    'wallLeft',
    field.wallThickness,
    field.wallHeight,
    outerLength,
    -halfWidth - field.wallThickness / 2,
    sideWallY,
    0,
  );
  addWall(
    'wallRight',
    field.wallThickness,
    field.wallHeight,
    outerLength,
    halfWidth + field.wallThickness / 2,
    sideWallY,
    0,
  );
  const endZ = halfLength + goal.depth + field.wallThickness / 2;
  addWall(
    'wallBack',
    field.width + field.wallThickness * 2,
    field.wallHeight,
    field.wallThickness,
    0,
    sideWallY,
    endZ,
  );
  addWall(
    'wallFront',
    field.width + field.wallThickness * 2,
    field.wallHeight,
    field.wallThickness,
    0,
    sideWallY,
    -endZ,
  );

  // ── Goals ───────────────────────────────────────────────────────────────────
  const goals = new Map<TeamId, GoalColliders>();

  for (const owner of ['home', 'away'] as const) {
    const sign = owner === 'home' ? -1 : 1;
    const goalZ = sign * halfLength;
    const parts = new Map<GoalPart, Mesh>();

    const postX = goal.width / 2 + goal.postRadius;
    const barY = goal.height + goal.postRadius;
    const junctionRadius = goal.junctionLength / 2;
    const postHeight = goal.height - junctionRadius;

    const addFramePart = (part: GoalPart, mesh: Mesh, shape: PhysicsShapeType) => {
      const aggregate = new PhysicsAggregate(
        mesh,
        shape,
        { mass: 0, friction: 0.25, restitution: 0.72 },
        scene,
      );
      aggregate.body.setCollisionCallbackEnabled(true);
      world.tag(aggregate.body, { kind: 'goalPart', goal: owner, part });
      parts.set(part, mesh);
    };

    for (const [part, x] of [
      ['leftPost', -postX],
      ['rightPost', postX],
    ] as const) {
      const post = MeshBuilder.CreateCylinder(
        `${owner}-${part}`,
        { height: postHeight, diameter: goal.postRadius * 2, tessellation: 16 },
        scene,
      );
      post.position.set(x, postHeight / 2, goalZ);
      addFramePart(part, post, PhysicsShapeType.CYLINDER);
    }

    const crossbar = MeshBuilder.CreateCylinder(
      `${owner}-crossbar`,
      {
        height: goal.width + goal.postRadius * 2 - goal.junctionLength,
        diameter: goal.postRadius * 2,
        tessellation: 16,
      },
      scene,
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, barY, goalZ);
    addFramePart('crossbar', crossbar, PhysicsShapeType.CYLINDER);

    for (const [part, x] of [
      ['leftJunction', -postX],
      ['rightJunction', postX],
    ] as const) {
      const junction = MeshBuilder.CreateSphere(
        `${owner}-${part}`,
        { diameter: junctionRadius * 2.2, segments: 12 },
        scene,
      );
      junction.position.set(x, goal.height, goalZ);
      addFramePart(part, junction, PhysicsShapeType.SPHERE);
    }

    // Invisible stopper so the ball stays in the net instead of flying away.
    const netBackZ = goalZ + sign * goal.depth;
    const stopper = MeshBuilder.CreateBox(
      `${owner}-netStopper`,
      { width: goal.width + goal.postRadius * 2, height: goal.height + 0.4, depth: 0.2 },
      scene,
    );
    stopper.position.set(0, (goal.height + 0.4) / 2, netBackZ + sign * 0.12);
    stopper.isVisible = false;
    const stopperAggregate = staticAggregate(stopper, PhysicsShapeType.BOX, scene, 0.9, 0.02);
    world.tag(stopperAggregate.body, { kind: 'wall' });

    goals.set(owner, { owner, parts, stopper });
  }

  return { ground, walls, goals };
}

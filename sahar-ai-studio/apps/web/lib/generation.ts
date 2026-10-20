import 'server-only';
import { prisma } from '@sahar/db';
import {
  validateRequest,
  type CostEstimate,
  type GenerationRequest,
  type ProviderKey,
  type RequestProblem,
} from '@sahar/providers';
import { formatTime } from './format';
import { getProviders } from './providers';

/** Everything needed to estimate and launch a generation for one owned scene. */
export async function loadSceneForGeneration(ownerId: string, sceneId: string) {
  return prisma.scene.findFirst({
    where: { id: sceneId, project: { ownerId, deletedAt: null } },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          outputWidth: true,
          outputHeight: true,
          fps: true,
          masterAudio: { select: { id: true, status: true } },
        },
      },
      character: { select: { id: true, name: true, defaultAppearance: true, deletedAt: true } },
      referenceImage: { select: { id: true, asset: { select: { id: true, status: true } } } },
    },
  });
}

export type SceneForGeneration = NonNullable<Awaited<ReturnType<typeof loadSceneForGeneration>>>;

export function requestForScene(scene: SceneForGeneration): GenerationRequest {
  return {
    operation: 'AUDIO_TO_VIDEO',
    startMs: scene.startMs,
    endMs: scene.endMs,
    width: scene.project.outputWidth,
    height: scene.project.outputHeight,
    fps: scene.project.fps,
  };
}

export interface ScenePlan {
  request: GenerationRequest;
  estimate: CostEstimate | null;
  problem: RequestProblem | 'songNotReady' | 'referenceNotReady' | null;
}

/** Validates a scene against a provider and computes the estimate shown before approval. */
export function planScene(scene: SceneForGeneration, providerKey: ProviderKey): ScenePlan {
  const provider = getProviders().get(providerKey)!;
  const request = requestForScene(scene);
  if (scene.project.masterAudio?.status !== 'READY')
    return { request, estimate: null, problem: 'songNotReady' };
  if (scene.referenceImage && scene.referenceImage.asset.status !== 'READY') {
    return { request, estimate: null, problem: 'referenceNotReady' };
  }
  const problem = validateRequest(provider, request);
  return { request, estimate: problem ? null : provider.estimateCost(request), problem };
}

export function sceneLabel(position: number, startMs: number, endMs: number) {
  return `Scene ${position + 1} · ${formatTime(startMs)}-${formatTime(endMs)}`;
}

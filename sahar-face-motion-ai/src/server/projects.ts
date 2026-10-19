import "server-only";
import { randomUUID } from "node:crypto";
import type { Asset, Job, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { keys, storage } from "@/server/storage";

export type AssetDTO = {
  id: string;
  kind: Asset["kind"];
  role: Asset["role"];
  status: Asset["status"];
  errorMessage: string | null;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  hasAudio: boolean | null;
  videoCodec: string | null;
  audioCodec: string | null;
  aiGenerated: boolean;
  hasPreview: boolean;
  hasPoster: boolean;
  createdAt: string;
  /** Live processing job, if any. */
  job: { status: Job["status"]; progress: number } | null;
};

export type ProjectDTO = {
  id: string;
  name: string;
  description: string | null;
  aspectRatio: string;
  createdAt: string;
  updatedAt: string;
  assets: AssetDTO[];
  events: { id: string; type: string; message: string; createdAt: string }[];
};

export function toAssetDTO(a: Asset, job?: Pick<Job, "status" | "progress"> | null): AssetDTO {
  return {
    id: a.id,
    kind: a.kind,
    role: a.role,
    status: a.status,
    errorMessage: a.errorMessage,
    originalName: a.originalName,
    mimeType: a.mimeType,
    sizeBytes: Number(a.sizeBytes),
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    fps: a.fps,
    hasAudio: a.hasAudio,
    videoCodec: a.videoCodec,
    audioCodec: a.audioCodec,
    aiGenerated: a.aiGenerated,
    hasPreview: Boolean(a.previewKey),
    hasPoster: Boolean(a.posterKey),
    createdAt: a.createdAt.toISOString(),
    job: job ? { status: job.status, progress: job.progress } : null,
  };
}

/** Project with assets, live jobs and history — or null if it doesn't exist or isn't the user's. */
export async function getProjectForUser(userId: string, projectId: string): Promise<ProjectDTO | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: {
      assets: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      jobs: { where: { type: "MEDIA_PROBE", status: { in: ["QUEUED", "RUNNING"] } }, select: { input: true, status: true, progress: true } },
    },
  });
  if (!project) return null;
  const jobByAsset = new Map(project.jobs.map((j) => [(j.input as { assetId?: string }).assetId, j]));
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    aspectRatio: project.aspectRatio,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    assets: project.assets.map((a) => toAssetDTO(a, jobByAsset.get(a.id))),
    events: project.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
  };
}

export async function listProjectsForUser(userId: string) {
  const projects = await db.project.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    include: {
      assets: { select: { id: true, kind: true, status: true, posterKey: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  return projects.map((p) => {
    const ready = p.assets.filter((a) => a.status === "READY");
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      aspectRatio: p.aspectRatio,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      counts: {
        IMAGE: ready.filter((a) => a.kind === "IMAGE").length,
        VIDEO: ready.filter((a) => a.kind === "VIDEO").length,
        AUDIO: ready.filter((a) => a.kind === "AUDIO").length,
        processing: p.assets.filter((a) => a.status === "PROCESSING").length,
      },
      coverAssetId: ready.find((a) => a.posterKey)?.id ?? null,
    };
  });
}

export function logEvent(tx: Prisma.TransactionClient, e: { projectId: string; userId: string; type: string; message: string; data?: Prisma.InputJsonValue }) {
  return tx.projectEvent.create({ data: e });
}

/** Copies the project row and every READY asset (objects copied in storage under the new project). */
export async function duplicateProject(userId: string, projectId: string): Promise<string | null> {
  const src = await db.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { assets: { where: { status: "READY" } } },
  });
  if (!src) return null;

  const newProjectId = randomUUID();
  const copied: Prisma.AssetCreateManyInput[] = [];
  const store = storage();
  try {
    for (const a of src.assets) {
      const id = randomUUID();
      const remap = (key: string | null) => (key ? keys.asset(userId, newProjectId, id, key.split("/").pop()!) : null);
      const storageKey = remap(a.storageKey)!;
      await store.copy(a.storageKey, storageKey);
      const previewKey = remap(a.previewKey);
      const posterKey = remap(a.posterKey);
      if (a.previewKey && previewKey) await store.copy(a.previewKey, previewKey);
      if (a.posterKey && posterKey) await store.copy(a.posterKey, posterKey);
      // Consent references are deliberately carried over: they describe the same media.
      const { id: _oldId, projectId: _p, createdAt: _c, producedByJobId: _j, ...rest } = a;
      void _oldId; void _p; void _c; void _j;
      copied.push({ ...rest, id, projectId: newProjectId, storageKey, previewKey, posterKey });
    }
    await db.$transaction(async (tx) => {
      await tx.project.create({
        data: {
          id: newProjectId,
          ownerId: userId,
          name: `${src.name} (עותק)`.slice(0, 80),
          description: src.description,
          aspectRatio: src.aspectRatio,
          duplicatedFromId: src.id,
        },
      });
      if (copied.length) await tx.asset.createMany({ data: copied });
      await logEvent(tx, { projectId: newProjectId, userId, type: "project.duplicated", message: `הפרויקט שוכפל מ"${src.name}" (${copied.length} קבצים)`, data: { from: src.id } });
      await logEvent(tx, { projectId: src.id, userId, type: "project.duplicated_to", message: "נוצר עותק של הפרויקט", data: { to: newProjectId } });
    });
    return newProjectId;
  } catch (e) {
    await store.deletePrefix(keys.project(userId, newProjectId)).catch(() => {});
    throw e;
  }
}

/** Deletes project rows (cascade) and every stored object under the project prefix. */
export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  const p = await db.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true } });
  if (!p) return false;
  await db.project.delete({ where: { id: p.id } });
  // Rows first: once gone, nothing can reference the objects. A purge failure only leaves orphans, never broken rows.
  await storage().deletePrefix(keys.project(userId, projectId)).catch((e) => console.error("project purge failed", projectId, e));
  return true;
}

export async function deleteAsset(userId: string, assetId: string): Promise<boolean> {
  const a = await db.asset.findFirst({ where: { id: assetId, ownerId: userId } });
  if (!a) return false;
  await db.$transaction([
    db.asset.delete({ where: { id: a.id } }),
    db.projectEvent.create({
      data: { projectId: a.projectId, userId, type: "asset.deleted", message: `הקובץ "${a.originalName ?? "ללא שם"}" נמחק` },
    }),
    db.project.update({ where: { id: a.projectId }, data: { updatedAt: new Date() } }),
  ]);
  await storage().deletePrefix(keys.asset(userId, a.projectId, a.id, "")).catch((e) => console.error("asset purge failed", a.id, e));
  return true;
}

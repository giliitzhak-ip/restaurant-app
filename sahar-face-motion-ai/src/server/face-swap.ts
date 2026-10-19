import "server-only";
import type { Asset, Job } from "@prisma/client";
import type { FacesResult } from "@/server/media/faces";
import { checkLimits, type CostEstimate, type FaceSwapProvider, type VideoInfo } from "@/providers/face-swap/types";
import { budgetStatus, jobBlockers } from "./billing";

export const QUOTE_TTL_MIN = 30;

export type FaceSwapInput = {
  sourceAssetId: string;
  targetAssetId: string;
  personIndex: number | null;
  faceConsentId: string;
  videoConsentId: string;
};

export type QuoteDTO = {
  provider: { id: string; name: string; paid: boolean; notes: string[]; maxDurationSec: number; faceSelection: string };
  estimate: CostEstimate;
  blockers: string[];
  video: VideoInfo;
};

export type AiJobDTO = {
  id: string;
  type: Job["type"];
  status: Job["status"];
  progress: number;
  provider: string;
  estimatedCostCents: number;
  approvedCostCents: number | null;
  actualCostCents: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  quoteExpiresAt: string | null;
  quote: QuoteDTO | null;
  input: FaceSwapInput;
  resultAssetId: string | null;
};

export function videoInfoOf(a: Asset): VideoInfo {
  return {
    durationSec: (a.durationMs ?? 0) / 1000,
    width: a.width ?? 0,
    height: a.height ?? 0,
    fps: a.fps,
    hasAudio: Boolean(a.hasAudio),
  };
}

export function toAiJobDTO(j: Job & { outputs?: { id: string }[] }): AiJobDTO {
  return {
    id: j.id,
    type: j.type,
    status: j.status,
    progress: j.progress,
    provider: j.provider,
    estimatedCostCents: j.estimatedCostCents,
    approvedCostCents: j.approvedCostCents,
    actualCostCents: j.actualCostCents,
    errorMessage: j.errorMessage,
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
    quoteExpiresAt: j.quoteExpiresAt?.toISOString() ?? null,
    quote: (j.quote as QuoteDTO | null) ?? null,
    input: j.input as FaceSwapInput,
    resultAssetId: j.outputs?.[0]?.id ?? ((j.output as { assetId?: string } | null)?.assetId ?? null),
  };
}

/** Validates the pair of assets for a face swap. Returns Hebrew errors. */
export function validateFaceSwapAssets(source: Asset | null, target: Asset | null, personIndex: number | null): string[] {
  const out: string[] = [];
  if (!source || source.kind !== "IMAGE") out.push("יש לבחור תמונת פנים.");
  else if (source.status !== "READY") out.push("תמונת הפנים עדיין בעיבוד.");
  else {
    const f = source.faces as FacesResult | null;
    if (f?.status === "ok" && f.persons.length === 0) out.push("לא זוהו פנים בתמונה שנבחרה. בחרו תמונה ברורה של הפנים, מלפנים ובתאורה טובה.");
  }
  if (!target || target.kind !== "VIDEO") out.push("יש לבחור סרטון.");
  else if (target.status !== "READY") out.push("הסרטון עדיין בעיבוד.");
  else {
    const f = target.faces as FacesResult | null;
    if (f?.status === "ok") {
      if (f.persons.length === 0) out.push("לא זוהו פנים בסרטון. החלפת פנים דורשת פנים גלויות.");
      if (personIndex !== null && !f.persons.some((p) => p.index === personIndex)) out.push("האדם שנבחר לא נמצא בסרטון.");
    }
  }
  return out;
}

export async function buildQuote(userId: string, provider: FaceSwapProvider, target: Asset): Promise<QuoteDTO> {
  const video = videoInfoOf(target);
  const estimate = provider.estimate(video);
  const budget = await budgetStatus(userId);
  const blockers = [...checkLimits(provider, video, Number(target.sizeBytes)), ...jobBlockers({ provider, costCents: estimate.costCents, budget })];
  return {
    provider: {
      id: provider.id,
      name: provider.displayName,
      paid: provider.paid,
      notes: provider.notes,
      maxDurationSec: provider.capabilities.maxDurationSec,
      faceSelection: provider.capabilities.faceSelection,
    },
    estimate,
    blockers,
    video,
  };
}

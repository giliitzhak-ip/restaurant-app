import { prisma } from '@sahar/db';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError, handleApiError, requireApiUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Live status of the caller's generation jobs: GET /api/generations?ids=a,b,c
 * Polled by the UI while jobs are queued or processing. Unknown/foreign ids are omitted.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const ids = (request.nextUrl.searchParams.get('ids') ?? '')
      .split(',')
      .filter(Boolean)
      .slice(0, 50);
    if (ids.length === 0) return apiError(400, 'idsRequired');
    const jobs = await prisma.generationJob.findMany({
      where: { id: { in: ids }, ownerId: user.id },
      select: {
        id: true,
        status: true,
        progress: true,
        errorCode: true,
        take: { select: { id: true, videoAssetId: true } },
      },
    });
    return NextResponse.json(
      jobs.map((job) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        errorCode: job.errorCode,
        videoAssetId: job.take?.videoAssetId ?? null,
      })),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

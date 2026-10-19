import { prisma } from '@sahar/db';
import { NextResponse } from 'next/server';
import { apiError, handleApiError, requireApiUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Processing status of an owned asset, polled by the UI while the worker runs. */
export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await requireApiUser();
    const { assetId } = await params;
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, ownerId: user.id, deletedAt: null },
      select: { status: true, failureReason: true },
    });
    if (!asset) return apiError(404, 'notFound');
    return NextResponse.json(asset, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

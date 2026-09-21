import path from 'node:path'
import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'
import { getStorage } from '@/lib/storage'
import { LocalStorageProvider } from '@/lib/storage/local'

export const runtime = 'nodejs'

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
}

/**
 * Serves locally stored media. Next only serves `public/` files that existed at
 * build time, so runtime uploads need their own handler. With a remote storage
 * provider this route is unused — URLs point straight at the CDN.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (getEnv().STORAGE_PROVIDER !== 'local') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { path: segments } = await params
  const key = segments.join('/')

  const extension = path.extname(key).toLowerCase()
  const contentType = CONTENT_TYPES[extension]
  if (!contentType) return new NextResponse('Not found', { status: 404 })

  const storage = getStorage()
  if (!(storage instanceof LocalStorageProvider)) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const body = await storage.read(key)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

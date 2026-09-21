import fs from 'node:fs/promises'
import path from 'node:path'
import type { PutObjectInput, StorageProvider, StoredObject } from './types'

/**
 * Development / single-node provider.
 *
 * Files are written outside `public/`, because Next.js only serves the files
 * that were present in `public/` at build time — anything uploaded afterwards
 * would 404 in production. They are served instead by the `/media/[...path]`
 * route handler, which streams from this directory at request time.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local'

  constructor(private readonly baseDir: string, private readonly publicPrefix = '/media') {}

  /**
   * Resolves a key inside the base directory. A key that escapes the root is
   * rejected outright — never silently rewritten into something that looks
   * safe, because callers rely on the rejection to detect a bad request.
   */
  private resolve(key: string): string {
    const root = path.resolve(this.baseDir)
    const target = path.resolve(root, key.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('נתיב קובץ אינו חוקי')
    }
    return target
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const target = this.resolve(input.key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, input.body)
    return {
      key: input.key,
      url: this.publicUrl(input.key),
      size: input.body.byteLength,
      mimeType: input.mimeType,
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true })
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key))
      return true
    } catch {
      return false
    }
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key))
  }

  publicUrl(key: string): string {
    return `${this.publicPrefix}/${key.replace(/^[/\\]+/, '')}`
  }
}

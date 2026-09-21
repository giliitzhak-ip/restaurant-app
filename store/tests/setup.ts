import 'dotenv/config'

/**
 * Tests must never touch the real upload directory: the media suite deletes
 * its storage root on teardown. These assignments override .env on purpose.
 */
process.env.LOCAL_STORAGE_DIR = './.test-uploads'
process.env.STORAGE_PROVIDER = 'local'
process.env.AUTH_SECRET ??= 'test-secret-that-is-long-enough-000'

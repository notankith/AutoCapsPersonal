/**
 * Supabase stub - Replaced with MongoDB + Oracle Object Storage
 * This file prevents import errors during migration
 */

export function createAdminClient() {
  throw new Error("Supabase admin has been replaced with MongoDB. Use getDb() from @/lib/mongodb instead.")
}

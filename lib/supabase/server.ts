/**
 * Supabase stub - Replaced with MongoDB + Oracle Object Storage
 * This file prevents import errors during migration
 */

export async function createClient() {
  throw new Error("Supabase has been replaced with MongoDB. Use getDb() from @/lib/mongodb instead.")
}

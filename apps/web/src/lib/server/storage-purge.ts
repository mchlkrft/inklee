import { serviceClient } from "@/lib/supabase/service";

// Recursive, paginated storage purge (service-role; buckets are RLS-locked).
// Extracted from account-deletion so account teardown and the Instagram
// disconnect teardown share one implementation.

// Supabase .list() is non-recursive (folders come back with a null id) and
// returns at most `limit` entries with no continuation, so we descend each
// level AND paginate it — otherwise a busy artist's files are silently missed.
async function listAllStorageFiles(
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: entries } = await serviceClient.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });
    const page = entries ?? [];
    for (const entry of page) {
      if (entry.id === null) {
        out.push(
          ...(await listAllStorageFiles(bucket, `${prefix}/${entry.name}`)),
        );
      } else {
        out.push(`${prefix}/${entry.name}`);
      }
    }
    if (page.length < PAGE) break;
  }
  return out;
}

/** Best-effort delete of every object under `prefix` in `bucket`. A transient
 *  storage error never throws — the caller (account delete, IG disconnect) must
 *  not abort on it, and the nightly cleanup cron reconciles any remainder. */
export async function purgeStoragePrefix(
  bucket: string,
  prefix: string,
): Promise<void> {
  let files: string[] = [];
  try {
    files = await listAllStorageFiles(bucket, prefix);
  } catch {
    return;
  }
  for (let i = 0; i < files.length; i += 100) {
    try {
      await serviceClient.storage.from(bucket).remove(files.slice(i, i + 100));
    } catch {
      // continue; idempotent vs the cron cleanup
    }
  }
}

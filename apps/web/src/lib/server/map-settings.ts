import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";

// Map-wide settings singleton (0091). Currently one knob: the seed density
// cap, lifted by default (null = unlimited) and re-armable by typing a
// number in the seeding admin.

export async function getSeedCapPerBucket(): Promise<number | null> {
  const { data } = await serviceClient
    .from("map_settings")
    .select("seed_cap_per_bucket")
    .eq("id", true)
    .maybeSingle();
  // Missing row or read error behaves like the configured default: no cap.
  const value = data?.seed_cap_per_bucket;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function setSeedCapPerBucketCore(
  adminId: string,
  cap: number | null,
): Promise<{ error?: string }> {
  if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 10000))
    return {
      error:
        "The cap must be a whole number between 1 and 10000, or empty for no cap.",
    };
  const { error } = await serviceClient.from("map_settings").upsert({
    id: true,
    seed_cap_per_bucket: cap,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  await writeAudit({
    action: "map_seed_cap_changed",
    actor: adminId,
    category: "admin",
    details: { seed_cap_per_bucket: cap },
  });
  return {};
}

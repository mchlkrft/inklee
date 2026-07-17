import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import type { DuplicateSignals } from "@inklee/shared/map-directory";
import DuplicatesQueue, { type SuggestionRow } from "./duplicates-queue";

export const metadata = { title: "Admin · Duplicate suggestions" };

const QUEUE_LIMIT = 200;

export default async function AdminMapDuplicatesPage() {
  await requireAdmin();

  const { data: suggestionData } = await serviceClient
    .from("map_duplicate_suggestions")
    .select(
      "id, location_a, location_b, confidence, signals, status, created_at",
    )
    .eq("status", "open")
    .order("confidence", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(QUEUE_LIMIT);
  const suggestions = (suggestionData ?? []) as Array<{
    id: string;
    location_a: string;
    location_b: string;
    confidence: string;
    signals: DuplicateSignals;
    status: string;
    created_at: string;
  }>;

  const locationIds = [
    ...new Set(suggestions.flatMap((s) => [s.location_a, s.location_b])),
  ];
  const { data: locationData } = locationIds.length
    ? await serviceClient
        .from("map_locations")
        .select("id, name, city, country, moderation_status")
        .in("id", locationIds)
    : { data: [] };
  const locations = new Map(
    (locationData ?? []).map((l) => [
      l.id as string,
      {
        name: l.name as string,
        place: [l.city, l.country].filter(Boolean).join(", "),
        moderation: l.moderation_status as string,
      },
    ]),
  );

  const rows: SuggestionRow[] = suggestions.map((s) => ({
    id: s.id,
    confidence: s.confidence,
    signals: s.signals,
    createdAt: s.created_at,
    a: {
      id: s.location_a,
      ...(locations.get(s.location_a) ?? {
        name: "Removed entry",
        place: "",
        moderation: "removed",
      }),
    },
    b: {
      id: s.location_b,
      ...(locations.get(s.location_b) ?? {
        name: "Removed entry",
        place: "",
        moderation: "removed",
      }),
    },
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map" className="hover:text-foreground">
            Map directory
          </Link>{" "}
          / Duplicates
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          Duplicate suggestions
        </h1>
        <p className="text-sm text-muted-foreground">
          Pairs the detector thinks are the same place. Nothing merges
          automatically: open both, keep the better entry, delete or hide the
          other, or dismiss the pair if they really are different studios.
        </p>
      </div>
      <DuplicatesQueue rows={rows} />
    </main>
  );
}

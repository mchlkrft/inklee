import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import LocationForm from "../location-form";

export const metadata = { title: "Admin · Add map location" };

export default async function AdminMapNewPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map" className="hover:text-foreground">
            Map directory
          </Link>{" "}
          / Add
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          Add map location
        </h1>
        <p className="text-sm text-muted-foreground">
          Hand-curated entry. Bulk imports stay blocked until the seeding source
          decision (open question Q2).
        </p>
      </div>
      <LocationForm
        placesApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      />
    </main>
  );
}

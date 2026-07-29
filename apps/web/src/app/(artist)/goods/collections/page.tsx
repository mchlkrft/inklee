import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsCollectionsAllowed } from "@/lib/server/entitlement-gates";
import CollectionsManager, { type CollectionRow } from "./collections-manager";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Both reads go through RLS, whose policies scope to the owner, so the
  // queries are the authorization.
  const [{ data: rawCollections }, { data: rawProducts }] = await Promise.all([
    supabase
      .from("product_collections")
      .select("id, name, position, is_public_visible")
      .eq("artist_id", user!.id)
      .order("position", { ascending: true }),
    supabase
      .from("products")
      .select("id, title, collection_id")
      .eq("artist_id", user!.id)
      .neq("status", "archived")
      .order("sort_order", { ascending: true }),
  ]);

  const products = (rawProducts ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    collectionId: (p.collection_id as string | null) ?? null,
  }));

  // Counted here rather than with a join: the artist needs to know what a
  // delete affects, and the list is small enough that a second query would be
  // more machinery than the number is worth.
  const counts = new Map<string, number>();
  for (const p of products) {
    if (p.collectionId) {
      counts.set(p.collectionId, (counts.get(p.collectionId) ?? 0) + 1);
    }
  }

  const collections: CollectionRow[] = (rawCollections ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    position: c.position as number,
    is_public_visible: c.is_public_visible as boolean,
    productCount: counts.get(c.id as string) ?? 0,
  }));

  let entitled = false;
  try {
    entitled = goodsCollectionsAllowed(await getAccountOverrides(user!.id));
  } catch {
    entitled = false;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Collections
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Group your shop into sections. Products without one show at the end.
        </p>
      </div>
      <CollectionsManager
        collections={collections}
        products={products}
        entitled={entitled}
      />
    </div>
  );
}

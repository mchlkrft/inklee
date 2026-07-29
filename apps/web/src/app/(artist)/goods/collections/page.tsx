import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsCollectionsAllowed } from "@/lib/server/entitlement-gates";
import { listCollectionsForArtist } from "@/lib/server/collections";
import CollectionsManager from "./collections-manager";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every read goes through RLS, whose policies scope to the owner, so the
  // queries are the authorization.
  const [collections, { data: rawProducts }, { data: rawItems }] =
    await Promise.all([
      listCollectionsForArtist(supabase, user!.id),
      supabase
        .from("products")
        .select("id, title")
        .eq("artist_id", user!.id)
        .neq("status", "archived")
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_collection_items")
        .select("collection_id, product_id, position")
        .eq("artist_id", user!.id)
        .order("position", { ascending: true }),
    ]);

  const products = (rawProducts ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
  }));

  const memberships = (rawItems ?? []).map((m) => ({
    collectionId: m.collection_id as string,
    productId: m.product_id as string,
    position: m.position as number,
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
          Group your shop into sections. A product can be in more than one.
          Anything with no section shows at the end.
        </p>
      </div>
      <CollectionsManager
        collections={collections}
        products={products}
        memberships={memberships}
        entitled={entitled}
      />
    </div>
  );
}

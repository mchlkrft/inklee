import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsBundlesAllowed } from "@/lib/server/entitlement-gates";
import { listBundlesForArtist } from "@/lib/server/bundles";
import { toPriceNumber } from "@inklee/shared/goods";
import BundlesManager from "./bundles-manager";

export const metadata = { title: "Bundles" };

export default async function BundlesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every read goes through RLS scoped to the owner, so the queries are the
  // authorization. Products carry their list price so the editor can show the
  // saving a bundle offers vs buying the parts separately.
  const [bundles, { data: rawProducts }] = await Promise.all([
    listBundlesForArtist(supabase, user!.id),
    supabase
      .from("products")
      .select("id, title, price_amount")
      .eq("artist_id", user!.id)
      .neq("status", "archived")
      .order("sort_order", { ascending: true }),
  ]);

  const products = (rawProducts ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    priceAmount: toPriceNumber(p.price_amount),
  }));

  let entitled = false;
  try {
    entitled = goodsBundlesAllowed(await getAccountOverrides(user!.id));
  } catch {
    entitled = false;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bundles
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sell a few products together at one price. Pick the products, set the
          bundle price, and your shop shows the saving.
        </p>
      </div>
      <BundlesManager
        bundles={bundles}
        products={products}
        entitled={entitled}
      />
    </div>
  );
}

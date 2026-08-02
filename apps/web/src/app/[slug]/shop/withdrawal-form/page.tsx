import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import { sellerDataComplete, type SellerData } from "@/lib/server/seller-data";
import { SUPPORT_INBOX_EMAIL } from "@/lib/server/support";

// C1.2's "model withdrawal form" reference: the standard EU model form
// (Consumer Rights Directive, Annex I(B)), addressed to the artist as seller
// (the disclosure block's own line: "Your purchase contract is with the
// artist"), with Inklee named as the alternative contact — mirroring the
// return notice's own "tell the artist... or Inklee..." wording. Same
// dark/invisible posture as the checkout page itself: this reference is
// meaningless without an active, fully-configured shop behind it.
export const metadata = {
  title: "Withdrawal form",
  robots: { index: false, follow: false },
};

export default async function WithdrawalFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isGoodsCommerceEnabled()) notFound();

  const { slug } = await params;
  const { data: artist } = await serviceClient
    .from("profiles")
    .select(
      "display_name, settings, seller_trading_name, seller_address, seller_contact",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!artist) notFound();
  if (!shopCheckoutEnabled(artist.settings)) notFound();

  const seller: SellerData = {
    tradingName: (artist.seller_trading_name as string | null) ?? null,
    address: (artist.seller_address as string | null) ?? null,
    contact: (artist.seller_contact as string | null) ?? null,
  };
  if (!sellerDataComplete(seller)) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Model withdrawal form
        </h1>
        <p className="text-sm text-muted-foreground">
          You do not have to use this form. Any clear statement that you are
          withdrawing works, sent to the artist or to Inklee. This is provided
          so you always have a working template available.
        </p>
      </header>

      <div className="space-y-4 rounded-[14px] border border-border p-5 text-sm text-foreground">
        <p>
          To: {seller.tradingName}, {seller.address} (contact: {seller.contact}
          ), or Inklee ({SUPPORT_INBOX_EMAIL}).
        </p>
        <p>
          I/we hereby give notice that I/we withdraw from my/our contract of
          sale of the following goods:
        </p>
        <p className="italic text-muted-foreground">
          [describe the item(s) you are returning]
        </p>
        <p>Ordered on / received on:</p>
        <p className="italic text-muted-foreground">[date]</p>
        <p>Name of consumer(s):</p>
        <p className="italic text-muted-foreground">[your name]</p>
        <p>Address of consumer(s):</p>
        <p className="italic text-muted-foreground">[your address]</p>
        <p>Signature of consumer(s) (only if this form is sent on paper):</p>
        <p>Date:</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Items marked &quot;custom-made&quot; are not covered by this right of
        return.
      </p>
    </div>
  );
}

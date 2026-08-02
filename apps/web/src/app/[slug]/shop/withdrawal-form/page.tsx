import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import { sellerDataComplete, type SellerData } from "@/lib/server/seller-data";
import { SUPPORT_INBOX_EMAIL } from "@/lib/server/support";
import {
  MODEL_WITHDRAWAL_FORM_CUSTOM_MADE_FOOTNOTE,
  MODEL_WITHDRAWAL_FORM_HEADING,
  MODEL_WITHDRAWAL_FORM_INTRO,
  modelWithdrawalFormLines,
  withdrawalForwardingNotice,
} from "@inklee/shared/consumer-disclosures";

// C1.2's "model withdrawal form": the standard EU model form (Consumer Rights
// Directive, Annex I(B)), addressed to the artist as seller (the disclosure
// block's own line: "Your purchase contract is with the artist"), with Inklee
// named as the alternative contact. COUNSEL Q7 (2026-08-02) approved that
// construction and attached one condition, `withdrawalForwardingNotice`: a
// withdrawal reaching Inklee counts as received on the day Inklee receives it
// and is passed to the artist without delay.
//
// Every string below comes from `@inklee/shared/consumer-disclosures`, not
// from this file. Counsel Q6 requires the SAME form to be reproduced inside
// the order confirmation, and two hand-maintained copies of a legal form is
// how a page and an email end up saying different things to the same buyer.
//
// Same dark/invisible posture as the checkout page itself: this form is
// meaningless without an active, fully-configured shop behind it, and it
// cannot even be addressed without complete seller data.
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

  // Q7: the artist's real name and address are rendered into the form, never
  // placeholders. sellerDataComplete above is what makes these assertions
  // safe.
  const lines = modelWithdrawalFormLines(
    {
      tradingName: seller.tradingName as string,
      address: seller.address as string,
      contact: seller.contact as string,
    },
    { supportEmail: SUPPORT_INBOX_EMAIL },
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          {MODEL_WITHDRAWAL_FORM_HEADING}
        </h1>
        <p className="text-sm text-muted-foreground">
          {MODEL_WITHDRAWAL_FORM_INTRO}
        </p>
        <p className="text-sm text-muted-foreground">
          {withdrawalForwardingNotice(SUPPORT_INBOX_EMAIL)}
        </p>
      </header>

      <div className="space-y-4 rounded-[14px] border border-border p-5 text-sm text-foreground">
        {lines.map((line) => (
          <div key={line.text} className="space-y-1">
            <p>{line.text}</p>
            {line.entry && (
              <p className="italic text-muted-foreground">{line.entry}</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {MODEL_WITHDRAWAL_FORM_CUSTOM_MADE_FOOTNOTE}
      </p>
    </div>
  );
}

import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import {
  sellerDataComplete,
  type SellerData,
} from "@inklee/shared/consumer-disclosures";

export type { SellerData };
export { sellerDataComplete };

/** Read an artist's seller identity (C1.1: trading name, address, contact) —
 *  the fields the checkout disclosure block and the goods-order receipt read
 *  from. Absent columns (every artist before this shipped) resolve to nulls,
 *  which `sellerDataComplete` treats as incomplete, never as an error. */
export async function fetchSellerData(artistId: string): Promise<SellerData> {
  const { data } = await serviceClient
    .from("profiles")
    .select("seller_trading_name, seller_address, seller_contact")
    .eq("id", artistId)
    .maybeSingle();
  return {
    tradingName: (data?.seller_trading_name as string | null) ?? null,
    address: (data?.seller_address as string | null) ?? null,
    contact: (data?.seller_contact as string | null) ?? null,
  };
}

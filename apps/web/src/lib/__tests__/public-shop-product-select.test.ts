import { describe, it, expect } from "vitest";
import {
  PUBLIC_SHOP_PRODUCT_SELECT,
  type PublicProduct,
} from "@inklee/shared/goods";

/**
 * Counsel Q5 guard.
 *
 * The defect this exists for is not a crash. `custom_made` was absent from the
 * bio-page shop's select while both other buyer-facing surfaces read it, so
 * `PublicProduct.customMade` arrived `undefined`, `customMadeRowSuffix(false)`
 * returned "", and the richest browse surface rendered no marker at all while
 * looking entirely healthy. Nothing failed. That is the whole problem: a
 * disclosure regression here is INVISIBLE at runtime and to the type checker,
 * because the field is optional by necessity (older readers) and an absent
 * boolean is indistinguishable from a false one.
 *
 * So the column list is asserted by name. A column removed from the select is
 * a red test rather than a silently unmarked non-returnable product.
 */

/** Columns whose absence changes what the buyer is TOLD, as opposed to how the
 *  page looks. These are the ones worth pinning individually. */
const DISCLOSURE_CRITICAL = ["custom_made"] as const;

/** Columns the surface needs to render a product at all. Pinned as a group so
 *  the disclosure assertion below cannot pass against a string that has been
 *  gutted down to just the one column it checks for. */
const STRUCTURAL = [
  "id",
  "title",
  "category",
  "price_amount",
  "currency",
  "status",
  "product_variants",
] as const;

describe("PUBLIC_SHOP_PRODUCT_SELECT", () => {
  // FAILS IF someone drops custom_made while editing the select. That edit
  // currently produces no compile error and no runtime error, which is exactly
  // why it needs a test rather than a comment.
  it.each(DISCLOSURE_CRITICAL)("selects the %s column", (column) => {
    expect(PUBLIC_SHOP_PRODUCT_SELECT).toContain(column);
  });

  // DISTINCTION CONTROL. Without this, the assertion above would still pass
  // against a select string that had been reduced to the literal
  // "custom_made" - i.e. a completely broken query. A guard that cannot tell a
  // working select from a destroyed one is not verifying anything.
  it.each(STRUCTURAL)("still selects the pre-existing %s column", (column) => {
    expect(PUBLIC_SHOP_PRODUCT_SELECT).toContain(column);
  });

  // custom_made must be selected on the PRODUCT, not accidentally nested
  // inside the product_variants(...) sub-select, where PostgREST would return
  // it per variant and the top-level field would stay undefined. The bug would
  // survive a naive `toContain` check, so the position is asserted.
  it("selects custom_made at the top level, not inside the variants sub-select", () => {
    const variantsStart =
      PUBLIC_SHOP_PRODUCT_SELECT.indexOf("product_variants(");
    const customMadeAt = PUBLIC_SHOP_PRODUCT_SELECT.indexOf("custom_made");
    expect(variantsStart).toBeGreaterThan(-1);
    expect(customMadeAt).toBeGreaterThan(-1);
    expect(customMadeAt).toBeLessThan(variantsStart);
  });

  // The type side of the same contract. `customMade` is optional on purpose,
  // so this pins that it EXISTS and is boolean-shaped; a rename would make the
  // render sites read undefined forever.
  it("PublicProduct carries a boolean customMade field", () => {
    const product: Pick<PublicProduct, "customMade"> = { customMade: true };
    expect(product.customMade).toBe(true);
    const unmarked: Pick<PublicProduct, "customMade"> = {};
    expect(unmarked.customMade).toBeUndefined();
  });
});

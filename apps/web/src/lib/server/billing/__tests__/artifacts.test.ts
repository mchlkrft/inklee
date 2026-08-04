import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable service-client mock: from(t).select(c).eq(...).maybeSingle().
// tax_policies uses one .eq(), billing_legal_policies uses two, so .eq() returns
// the same chain object (any depth) ending in maybeSingle().
const maybeSingle = vi.fn();
const chain: { eq: ReturnType<typeof vi.fn>; maybeSingle: typeof maybeSingle } =
  {
    eq: vi.fn(() => chain),
    maybeSingle,
  };
const select = vi.fn(() => chain);
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: () => ({ select }) },
}));

const getLegalDoc = vi.fn();
vi.mock("@/lib/legal/documents", () => ({
  getLegalDoc: (id: string) => getLegalDoc(id),
}));

import { getCurrentBillingArtifacts } from "@/lib/server/billing/artifacts";

const UNRESOLVED = "__unresolved__";

beforeEach(() => {
  maybeSingle.mockReset();
  getLegalDoc.mockReset();
});

describe("getCurrentBillingArtifacts (fail-closed)", () => {
  it("resolves real versions when available", async () => {
    maybeSingle.mockResolvedValue({
      data: { version_label: "v9" },
      error: null,
    });
    // Distinct hash per doc id so a caller reading the wrong doc's hash into
    // the wrong key (e.g. privacy_notice_approved getting the terms hash)
    // fails this assertion instead of passing by coincidence.
    getLegalDoc.mockImplementation((id: string) => ({
      versionHash: id === "terms" ? "termhash" : "privacyhash",
    }));
    const a = await getCurrentBillingArtifacts();
    expect(a.terms_approved).toBe("termhash");
    expect(a.privacy_notice_approved).toBe("privacyhash");
    expect(a.tax_policy_approved).toBe("v9");
    expect(a.consumer_classification_approved).toBe("v9");
    expect(a.consumer_withdrawal_copy_approved).toBe("v9");
  });

  it("returns the fail-closed sentinel when a version cannot be read", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    getLegalDoc.mockImplementation(() => {
      throw new Error("content not bundled at runtime");
    });
    const a = await getCurrentBillingArtifacts();
    expect(a.terms_approved).toBe(UNRESOLVED);
    expect(a.privacy_notice_approved).toBe(UNRESOLVED);
    expect(a.tax_policy_approved).toBe(UNRESOLVED);
    expect(a.consumer_classification_approved).toBe(UNRESOLVED);
    expect(a.consumer_withdrawal_copy_approved).toBe(UNRESOLVED);
  });

  it("a DB error also fails closed, and terms/privacy resolve independently of it", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "down" } });
    getLegalDoc.mockImplementation((id: string) => ({
      versionHash: id === "terms" ? "termhash" : "privacyhash",
    }));
    const a = await getCurrentBillingArtifacts();
    expect(a.tax_policy_approved).toBe(UNRESOLVED);
    expect(a.terms_approved).toBe("termhash");
    expect(a.privacy_notice_approved).toBe("privacyhash");
  });
});

import { describe, it, expect } from "vitest";
import {
  aggregateClients,
  type ClientBookingRow,
} from "@inklee/shared/clients";

const row = (over: Partial<ClientBookingRow>): ClientBookingRow => ({
  customer_email: "a@x.com",
  customer_handle: "a",
  status: "pending",
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});

describe("aggregateClients", () => {
  it("groups by email, first row (latest) wins status/date, count bumps", () => {
    const items = aggregateClients([
      row({
        customer_email: "a@x.com",
        status: "approved",
        created_at: "2026-06-10T00:00:00Z",
      }),
      row({
        customer_email: "a@x.com",
        status: "pending",
        created_at: "2026-06-01T00:00:00Z",
      }),
      row({
        customer_email: "b@x.com",
        customer_handle: "bee",
        status: "rejected",
      }),
    ]);
    expect(items).toHaveLength(2);
    const a = items.find((c) => c.email === "a@x.com")!;
    expect(a.bookingCount).toBe(2);
    expect(a.latestStatus).toBe("approved"); // the first (newest) row
    expect(a.lastBookingAt).toBe("2026-06-10T00:00:00Z");
    const b = items.find((c) => c.email === "b@x.com")!;
    expect(b).toMatchObject({ handle: "bee", bookingCount: 1 });
  });

  it("preserves newest-first insertion order and skips null emails", () => {
    const items = aggregateClients([
      row({ customer_email: "z@x.com" }),
      row({ customer_email: null }),
      row({ customer_email: "y@x.com" }),
    ]);
    expect(items.map((c) => c.email)).toEqual(["z@x.com", "y@x.com"]);
  });

  it("defaults a missing handle to empty string", () => {
    const [c] = aggregateClients([row({ customer_handle: null })]);
    expect(c.handle).toBe("");
  });
});

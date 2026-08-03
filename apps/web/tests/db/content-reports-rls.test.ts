import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";

// content_reports (migration 0155): the durable DSA notice-and-action queue.
// Service-role-only by design (RLS enabled, zero policies), because the only
// writer is the public /legal/report server action running as serviceClient
// and the only reader is an operator surface, also serviceClient. This gate
// FAILS if a policy is ever added that lets a user-scoped client read or write
// the queue, which would leak reporters' contact details.

let admin: SupabaseClient;
let actor: Actor;
const createdIds: string[] = [];

function sampleReport() {
  return {
    category: "image_without_consent",
    url: "https://inklee.app/somebody/hub",
    description: "This photo shows me without my consent, please remove it.",
    reporter_name: "Dana Doe",
    reporter_email: "dana@example.com",
    reference: "DSA-TEST-" + Math.random().toString(36).slice(2, 8),
  };
}

beforeAll(async () => {
  admin = adminClient();
  actor = await makeActor(admin, "content-reports");
}, 60_000);

afterAll(async () => {
  if (createdIds.length) {
    await admin.from("content_reports").delete().in("id", createdIds);
  }
  await destroyActor(admin, actor);
});

describe("content_reports RLS: service-role-only (0155)", () => {
  it("the service role CAN insert (positive control, so a later 42501 means RLS, not a broken insert)", async () => {
    const { data, error } = await admin
      .from("content_reports")
      .insert(sampleReport())
      .select("id, status")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.status).toBe("new");
    if (data?.id) createdIds.push(data.id);
  });

  it("an authenticated user CANNOT insert (42501: RLS enabled with no policy)", async () => {
    const { error } = await actor.client
      .from("content_reports")
      .insert(sampleReport());
    expect(error?.code).toBe("42501");
  });

  it("an authenticated user reads NO rows even though one exists (RLS hides the reporter's data)", async () => {
    const { data: inserted } = await admin
      .from("content_reports")
      .insert(sampleReport())
      .select("id")
      .single();
    const id = inserted!.id;
    createdIds.push(id);
    // The service role sees it...
    const { data: adminSees } = await admin
      .from("content_reports")
      .select("id")
      .eq("id", id);
    expect(adminSees?.length).toBe(1);
    // ...the authenticated user sees nothing.
    const { data: userSees } = await actor.client
      .from("content_reports")
      .select("id")
      .eq("id", id);
    expect(userSees ?? []).toEqual([]);
  });
});

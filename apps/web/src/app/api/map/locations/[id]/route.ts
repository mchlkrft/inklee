import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import { getMapLocationDetail } from "@/lib/server/map-location-detail";

export const runtime = "nodejs";

// Single map-location detail for the immersive in-canvas panel. Logged-in only
// (the map is not client-facing, scope section 1); reads go through the tested
// server read-model, approved rows only.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!tattooMapEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const detail = await getMapLocationDetail(id, user.id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ detail });
}

import { NextResponse } from "next/server";
import { isAutomatedSeedImportEnabled } from "@/lib/features";
import { runCountrySeed } from "@/lib/server/seed-automation";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * CLI-equivalent trigger for the automated seed lane (scripts/seed-country.cjs
 * posts here). CRON_SECRET bearer auth, the same wall the cron routes use; the
 * lane additionally refuses to run unless AUTOMATED_SEED_IMPORT_ENABLED is
 * set. No browser automation anywhere: this is a first-class protected
 * entry point into the same pipeline the admin panel calls.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAutomatedSeedImportEnabled()) {
    return NextResponse.json(
      { error: "Automated seed import is disabled." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const b = body as {
    countryCode?: unknown;
    areaId?: unknown;
    mode?: unknown;
    label?: unknown;
    maxImport?: unknown;
    candidates?: unknown;
  };
  if (
    typeof b.countryCode !== "string" ||
    typeof b.areaId !== "string" ||
    (b.mode !== "dry_run" && b.mode !== "import") ||
    b.candidates === undefined
  ) {
    return NextResponse.json(
      {
        error:
          "Required: countryCode (string), areaId (uuid), mode (dry_run|import), candidates (array or raw JSON string).",
      },
      { status: 400 },
    );
  }

  const raw =
    typeof b.candidates === "string"
      ? b.candidates
      : JSON.stringify(b.candidates);
  const result = await runCountrySeed({
    adminId: null,
    countryCode: b.countryCode,
    areaId: b.areaId,
    raw,
    inputLabel: typeof b.label === "string" ? b.label : null,
    mode: b.mode,
    maxImport:
      typeof b.maxImport === "number" && Number.isFinite(b.maxImport)
        ? b.maxImport
        : undefined,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, runId: result.runId ?? null },
      { status: 422 },
    );
  }
  return NextResponse.json({ summary: result.summary });
}

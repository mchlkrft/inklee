import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { largeProjectsAllowed } from "@/lib/server/entitlement-gates";
import { publicArtistUrl } from "@/lib/public-url";
import {
  PROJECT_STATUS_META,
  OPEN_PROJECT_STATUSES,
  labelForKey,
  BODY_AREAS,
  PROJECT_SCALES,
  type ProjectRecord,
  type ProjectStatus,
} from "@inklee/shared/projects";

export const metadata = { title: "Projects" };

/** Read via RLS, not the service client: the policy on `projects` scopes to
 *  the owner, so the query is the authorization. */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const showAll = status === "all";
  let query = supabase
    .from("projects")
    .select("*")
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });
  if (!showAll) query = query.in("status", OPEN_PROJECT_STATUSES);

  const [{ data: rows }, { data: profile }] = await Promise.all([
    query,
    supabase.from("profiles").select("slug").eq("id", user!.id).single(),
  ]);
  const projects = (rows ?? []) as ProjectRecord[];

  // Reading is never gated (see largeProjectsAllowed): this only decides
  // whether we show the artist their live intake link or explain that new
  // enquiries are not being taken.
  let entitled = false;
  try {
    entitled = largeProjectsAllowed(await getAccountOverrides(user!.id));
  } catch {
    entitled = false;
  }
  const slug = (profile?.slug as string | null) ?? null;
  const intakeUrl = slug ? `${publicArtistUrl(slug)}/project` : null;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Projects
        </h1>
        <p className="text-sm text-muted-foreground">
          Sleeves, back pieces and anything that runs over several sessions.
        </p>
      </div>

      {entitled && intakeUrl ? (
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-foreground">Your enquiry link</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {intakeUrl}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Large-project enquiries are part of Plus. Projects you already have
            stay here and keep working.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Link
          href="/bookings/projects"
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            showAll
              ? "border-border text-muted-foreground"
              : "border-foreground bg-foreground/10 text-foreground"
          }`}
        >
          Open
        </Link>
        <Link
          href="/bookings/projects?status=all"
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            showAll
              ? "border-foreground bg-foreground/10 text-foreground"
              : "border-border text-muted-foreground"
          }`}
        >
          Everything
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showAll
            ? "No projects yet."
            : "Nothing open. Switch to everything to see completed and declined ones."}
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/bookings/projects/${p.id}`}
                className="block rounded-md border border-border px-4 py-3 transition-colors hover:border-foreground/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {p.title}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                    {PROJECT_STATUS_META[p.status as ProjectStatus]?.label ??
                      p.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.customer_email}
                  {" · "}
                  {labelForKey(PROJECT_SCALES, p.scale)}
                  {p.body_areas.length > 0 &&
                    ` · ${p.body_areas
                      .map((a) => labelForKey(BODY_AREAS, a))
                      .filter(Boolean)
                      .join(", ")}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

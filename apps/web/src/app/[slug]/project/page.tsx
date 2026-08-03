import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { serviceClient } from "@/lib/supabase/service";
import { surfaceAppearance } from "@/lib/server/appearance";
import { bookingTemplateStyles } from "@inklee/shared/booking-template-styles";
import { accentHex } from "@inklee/shared/appearance";
import { COVER_COLORS } from "@inklee/shared/cover-colors";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { largeProjectsAllowed } from "@/lib/server/entitlement-gates";
import { publicBrandingHidden } from "@/lib/server/public-branding";
import { apexHref } from "@/lib/public-url";
import ProjectForm from "./project-form";

// Large-project intake (Plus build P4), the sub-path precedent the flash
// intake set: a second public intake on the artist's namespace that writes a
// specialized record rather than a standard booking request.
//
// Hidden from search like every other artist-owned public surface (the
// 2026-06-16 noindex decision).
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function ProjectIntakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, display_name, logo_url, location, instagram_handle, settings")
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();
  if (!profile) notFound();

  // The gate is a 404, not a message. A half-working sub-path on an
  // un-entitled artist's page is worse than no page: it tells a client the
  // artist takes project enquiries when they do not.
  let entitled = false;
  try {
    entitled = largeProjectsAllowed(
      await getAccountOverrides(profile.id as string),
    );
  } catch {
    entitled = false;
  }
  if (!entitled) notFound();

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  // Its own appearance surface, which is what `largeProject` was reserved for
  // in the P1 keystone. An artist who set nothing renders exactly like their
  // booking form.
  const appearance = await surfaceAppearance(
    profile.id as string,
    settings,
    "largeProject",
  );
  const tpl = bookingTemplateStyles(appearance.resolved.template);
  const coverImage = appearance.resolved.backgroundImageUrl;
  const coverColor = accentHex(appearance.resolved.accent, COVER_COLORS);
  const hideBranding = await publicBrandingHidden(profile.id as string);

  const firstName = (profile.display_name as string).split(" ")[0];
  const headerStyle: React.CSSProperties = coverImage
    ? {
        backgroundImage: `url(${coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : coverColor
      ? { backgroundColor: coverColor }
      : {};

  const homeHref = await apexHref("/");
  // Apex-only namespace (host.ts APEX_ONLY_PREFIXES): a relative /terms or
  // /privacy on an artist subdomain would be slug-prefixed by the proxy and
  // 404, same reasoning as every other public intake's privacy notice.
  const termsHref = await apexHref("/terms");
  const privacyHref = await apexHref("/privacy");

  return (
    <div className="flex min-h-screen flex-col bg-brand-charcoal text-brand-bone">
      <header className={tpl.header} style={headerStyle}>
        {coverImage && (
          <div aria-hidden className="absolute inset-0 bg-brand-charcoal/55" />
        )}
        <div className={tpl.headerInner}>
          {profile.logo_url && (
            <div className={tpl.logo}>
              <Image
                src={profile.logo_url as string}
                alt={profile.display_name as string}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="space-y-1">
            <h1 className={tpl.name}>{profile.display_name as string}</h1>
            {profile.location && (
              <div className={tpl.meta}>
                <span>{profile.location as string}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        data-appearance="light"
        style={appearance.cssVars as React.CSSProperties}
        className={tpl.panel}
      >
        <div className={tpl.panelInner}>
          <div>
            <h2 className={tpl.heading}>Big project enquiry</h2>
            <p className={tpl.subheading}>
              For sleeves, back pieces, bodysuits and anything that runs over
              several sessions. Tell {firstName} what you are planning and they
              will come back to you.
            </p>
          </div>

          <ProjectForm
            slug={slug}
            artistFirstName={firstName}
            termsHref={termsHref}
            privacyHref={privacyHref}
          />

          {!hideBranding && (
            <p className="pt-4 text-center text-xs text-muted-foreground">
              <a
                href={homeHref}
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Made with Inklee
              </a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

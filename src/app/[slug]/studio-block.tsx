type PublicStudio = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  formatted_address: string | null;
  address: string | null;
  google_maps_url: string | null;
  visibility_mode: string;
  public_note: string | null;
};

export default function StudioBlock({
  studio,
}: {
  studio: PublicStudio | null;
}) {
  if (!studio || studio.visibility_mode === "hidden") return null;

  const {
    name,
    city,
    country,
    formatted_address,
    address,
    google_maps_url,
    visibility_mode,
    public_note,
  } = studio;

  const areaLine = [city, country].filter(Boolean).join(", ");

  if (visibility_mode === "public_exact_address") {
    const addressLine = formatted_address || address || areaLine;
    return (
      <div className="space-y-1 rounded-md border border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{name}</p>
        {addressLine && (
          <p className="text-xs text-muted-foreground">{addressLine}</p>
        )}
        {public_note && (
          <p className="text-xs text-muted-foreground">{public_note}</p>
        )}
        {google_maps_url && (
          <a
            href={google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Open in Google Maps
          </a>
        )}
      </div>
    );
  }

  if (visibility_mode === "public_area_only") {
    return (
      <div className="space-y-1 rounded-md border border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{name}</p>
        {areaLine && (
          <p className="text-xs text-muted-foreground">{areaLine}</p>
        )}
        {public_note && (
          <p className="text-xs text-muted-foreground">{public_note}</p>
        )}
      </div>
    );
  }

  if (visibility_mode === "after_approval_only") {
    return (
      <div className="space-y-1 rounded-md border border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{name}</p>
        {areaLine && (
          <p className="text-xs text-muted-foreground">{areaLine}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Exact studio address shared after booking approval.
        </p>
        {public_note && (
          <p className="text-xs text-muted-foreground">{public_note}</p>
        )}
      </div>
    );
  }

  return null;
}

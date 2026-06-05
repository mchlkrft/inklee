type PlaceholderVisualProps = {
  label: string;
  caption?: string;
  aspectRatio?: "video" | "square" | "portrait" | "wide";
};

const ASPECT_CLASSES: Record<
  NonNullable<PlaceholderVisualProps["aspectRatio"]>,
  string
> = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[4/3]",
};

export default function PlaceholderVisual({
  label,
  caption,
  aspectRatio = "wide",
}: PlaceholderVisualProps) {
  return (
    <div
      className={`flex w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 ${ASPECT_CLASSES[aspectRatio]}`}
    >
      <div className="space-y-1 px-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}

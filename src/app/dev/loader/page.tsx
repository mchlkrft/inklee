import BrandLoader from "@/components/brand-loader";

export default function LoaderPreviewPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-16">
      <div className="text-center space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Brand loader preview
        </p>
        <p className="text-xs text-muted-foreground">
          Dev only — not linked in production
        </p>
      </div>

      <div className="flex items-end gap-16 flex-wrap justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLoader size={120} interval={2000} />
          <p className="text-xs text-muted-foreground">120px · 2s</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <BrandLoader size={80} interval={1600} label="Loading…" />
          <p className="text-xs text-muted-foreground">80px · 1.6s · label</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <BrandLoader size={48} interval={1200} />
          <p className="text-xs text-muted-foreground">48px · 1.2s</p>
        </div>
      </div>
    </div>
  );
}

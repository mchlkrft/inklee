import { Globe, Mail } from "lucide-react";
import {
  siInstagram,
  siTiktok,
  siX,
  siFacebook,
  siYoutube,
  siThreads,
  siPinterest,
} from "simple-icons";
import type { BioSocialPlatform } from "@/lib/bio-page-settings";

// Brand glyphs for the Link Hub's social row. simple-icons supplies the path
// data for the brand platforms (web-only dep); website / email fall back to
// lucide generics. The app render (slice 3) uses Ionicons logos for the same
// platform keys -- icons are a per-surface rendering concern, the platform key
// is the shared source of truth.
const BRAND_PATH: Record<
  Exclude<BioSocialPlatform, "website" | "email">,
  string
> = {
  instagram: siInstagram.path,
  tiktok: siTiktok.path,
  x: siX.path,
  facebook: siFacebook.path,
  youtube: siYoutube.path,
  threads: siThreads.path,
  pinterest: siPinterest.path,
};

export function SocialIcon({
  platform,
  className,
}: {
  platform: BioSocialPlatform;
  className?: string;
}) {
  if (platform === "website")
    return <Globe className={className} aria-hidden />;
  if (platform === "email") return <Mail className={className} aria-hidden />;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d={BRAND_PATH[platform]} />
    </svg>
  );
}

import { Globe, Mail, Store } from "lucide-react";
import { BIO_SOCIAL_ICON_PATH } from "@inklee/shared/bio-social-icons";
import type { BioSocialPlatform } from "@/lib/bio-page-settings";

// Brand glyphs for the Link Hub's social row come from the shared 24x24 path map
// (one source of truth with the app, which renders the same paths via
// react-native-svg). website / email and any platform without a brand path
// (e.g. fourthwall) fall back to a generic lucide glyph. fill=currentColor keeps
// every mark monochrome in the Hub's bone color, so the row reads as one set.
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
  const path = BIO_SOCIAL_ICON_PATH[platform];
  if (!path) return <Store className={className} aria-hidden />;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

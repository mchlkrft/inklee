import { requireAdmin } from "@/lib/admin-guard";
import StyleLab from "./style-lab";

export const metadata = {
  title: "Dev · Map style lab",
  robots: { index: false, follow: false },
};

// Admin-only design surface for the branded basemap. Read-only against the
// app: it renders candidate palettes and prints the token block to paste
// into packages/shared/src/map-style.ts.
export default async function MapStyleLabPage() {
  await requireAdmin();
  return <StyleLab />;
}

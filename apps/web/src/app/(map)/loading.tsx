import BrandLoader from "@/components/brand-loader";

// Pending UI for map navigations (mirrors the (artist) loading state the
// routes had before the S2 move).
export default function MapLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrandLoader size={88} />
    </div>
  );
}

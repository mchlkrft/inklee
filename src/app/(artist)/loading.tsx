import BrandLoader from "@/components/brand-loader";

export default function ArtistLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrandLoader size={88} interval={2000} />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProductForm from "../product-form";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/goods"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Goods
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Add product
      </h1>
      <ProductForm mode="create" />
    </div>
  );
}

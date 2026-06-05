import { redirect } from "next/navigation";

// The create flow moved into the quick-create modal on /goods (Slice 73
// follow-up). This route is kept only so old links don't 404.
export default function NewProductPage() {
  redirect("/goods");
}

import { redirect } from "next/navigation";

// This step was merged into claim-slug in the onboarding refactor.
// Users arriving here mid-flow continue from booking mode.
export default function OnboardingProfilePage() {
  redirect("/onboarding/booking");
}

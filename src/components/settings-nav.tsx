import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Bio page", href: "/settings/bio-page" },
  { label: "Emails", href: "/settings/emails" },
  { label: "Calendar", href: "/settings/calendar" },
  { label: "Payouts", href: "/settings/payouts" },
  { label: "Dashboard", href: "/settings/dashboard" },
  { label: "Account", href: "/settings/account" },
];

export default function SettingsNav() {
  return <SectionNav items={ITEMS} />;
}

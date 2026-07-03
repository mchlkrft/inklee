import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Emails", href: "/settings/emails" },
  { label: "Calendar", href: "/settings/calendar" },
  { label: "Payouts", href: "/settings/payouts" },
  { label: "Dashboard", href: "/settings/dashboard" },
  { label: "Account", href: "/settings/account" },
  { label: "Support", href: "/support" },
];

export default function SettingsNav() {
  return <SectionNav items={ITEMS} />;
}

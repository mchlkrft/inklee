import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Emails", href: "/settings/emails" },
  { label: "Calendar", href: "/settings/calendar" },
  { label: "Dashboard", href: "/settings/dashboard" },
  { label: "Account", href: "/settings/account" },
];

export default function SettingsNav() {
  return <SectionNav items={ITEMS} />;
}

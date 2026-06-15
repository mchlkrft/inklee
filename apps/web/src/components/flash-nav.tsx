import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Designs", href: "/flash/items" },
  { label: "Days", href: "/flash/days" },
  { label: "Instagram", href: "/flash/instagram" },
];

export default function FlashNav() {
  return <SectionNav items={ITEMS} />;
}

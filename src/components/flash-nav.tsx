import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Flash Items", href: "/flash/items" },
  { label: "Flash Days", href: "/flash/days" },
  { label: "Instagram", href: "/flash/instagram" },
];

export default function FlashNav() {
  return <SectionNav items={ITEMS} />;
}

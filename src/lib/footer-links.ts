export type FooterLink = {
  label: string;
  href: string;
  active: boolean;
  planned?: boolean;
  external?: boolean;
};

export type FooterGroup = {
  id: string;
  label: string;
  items: FooterLink[];
};

export const FOOTER_GROUPS: FooterGroup[] = [
  {
    id: "product",
    label: "Product",
    items: [
      {
        label: "Tattoo booking tool",
        href: "/tattoo-booking-software",
        active: true,
      },
      {
        label: "Instagram booking link",
        href: "/instagram-booking-link-for-tattoo-artists",
        active: true,
      },
      {
        label: "Tattoo booking form",
        href: "/tattoo-booking-form",
        active: true,
      },
      {
        label: "Guest spot booking",
        href: "/guest-spot-booking",
        active: true,
      },
      {
        label: "Live example",
        href: "/bert-grimm",
        active: true,
        external: true,
      },
      {
        label: "Tattoo artist waitlist",
        href: "/tattoo-artist-waitlist",
        active: true,
      },
      {
        label: "Tattoo deposit tool",
        href: "/tattoo-deposit-tool",
        active: true,
      },
    ],
  },
  {
    id: "compare",
    label: "Compare",
    items: [
      {
        label: "Instagram DMs vs Inklee",
        href: "/tattoo-booking-software-vs-instagram-dms",
        active: true,
      },
      {
        label: "Inklee vs Google Forms",
        href: "/tattoo-booking-software-vs-google-forms",
        active: true,
      },
      {
        label: "Inklee vs Calendly",
        href: "/tattoo-booking-software-vs-calendly",
        active: true,
      },
      {
        label: "Best booking app for tattoo artists",
        href: "/best-booking-app-for-tattoo-artists",
        active: true,
      },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    items: [
      {
        label: "Tattoo booking form checklist",
        href: "/resources/tattoo-booking-form-checklist",
        active: false,
        planned: true,
      },
      {
        label: "Guest spot planning checklist",
        href: "/resources/guest-spot-planning-checklist",
        active: false,
        planned: true,
      },
      {
        label: "Instagram booking link guide",
        href: "/resources/instagram-booking-link-guide-for-tattoo-artists",
        active: false,
        planned: true,
      },
      {
        label: "DM chaos calculator",
        href: "/resources/dm-chaos-calculator",
        active: false,
        planned: true,
      },
    ],
  },
  {
    id: "company",
    label: "Company",
    items: [
      { label: "Home", href: "/", active: true },
      { label: "About", href: "/about", active: true },
      { label: "Help", href: "/help", active: true },
      { label: "Start", href: "/start", active: true },
    ],
  },
  {
    id: "legal",
    label: "Legal",
    items: [
      { label: "Imprint", href: "/imprint", active: true },
      { label: "Privacy", href: "/privacy", active: true },
      { label: "Terms", href: "/terms", active: true },
      { label: "DPA", href: "/dpa", active: true },
      { label: "Acceptable Use", href: "/acceptable-use", active: true },
      { label: "Cookies", href: "/cookies", active: false, planned: true },
    ],
  },
];

export function getRenderableFooterGroups(): FooterGroup[] {
  return FOOTER_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.active),
  })).filter((group) => group.items.length > 0);
}

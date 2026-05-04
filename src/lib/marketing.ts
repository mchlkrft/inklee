export type CtaLink = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
  external?: boolean;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type RelatedLink = {
  eyebrow?: string;
  title: string;
  description: string;
  href: string;
};

export type FeatureBenefitItem = {
  title: string;
  description: string;
  label?: string;
  illustration?: string;
};

export type ComparisonRow = {
  feature: string;
  alternative: string;
  inklee: string;
};

export type ProblemPoint = {
  title: string;
  description: string;
};

export type SolutionPoint = {
  title: string;
  description: string;
};

export type SectionVariant = "default" | "muted" | "mustard" | "card";

export type MarketingHeroProps = {
  eyebrow?: string;
  heading: string;
  subhead: string;
  primaryCta?: CtaLink;
  secondaryCta?: CtaLink;
  proof?: string;
  visual?: React.ReactNode;
};

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-[20px] border border-border p-6", className)}
      {...props}
    />
  );
}

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center gap-3", className)} {...props} />
  );
}

/**
 * Circular chip used as the leading icon in widget/section headers.
 * Uses solid brand colors with text picked for contrast.
 * `bone` is the inverted neutral — charcoal background with bone icon —
 * so it reads on the bone workspace surface.
 */
const TINT_CLASSES = {
  mustard: "bg-brand-mustard text-brand-charcoal",
  rosa: "bg-brand-rosa text-brand-charcoal",
  cobalt: "bg-brand-cobalt text-brand-bone",
  red: "bg-brand-red text-brand-bone",
  green: "bg-brand-green text-brand-bone",
  bone: "bg-brand-charcoal text-brand-bone",
} as const;

export type IconTint = keyof typeof TINT_CLASSES;

interface IconChipProps {
  icon: LucideIcon;
  tint?: IconTint;
  size?: "sm" | "md";
  className?: string;
}

export function IconChip({
  icon: Icon,
  tint = "bone",
  size = "md",
  className,
}: IconChipProps) {
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const iconDim = size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        dim,
        TINT_CLASSES[tint],
        className,
      )}
    >
      <Icon className={iconDim} strokeWidth={1.8} />
    </span>
  );
}

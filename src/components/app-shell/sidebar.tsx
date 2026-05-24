"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import RandomizedLogo from "@/components/randomized-logo";
import { SIDEBAR_NAV, isItemActive } from "./nav-config";
import SidebarItem from "./sidebar-item";
import SidebarSubItem from "./sidebar-sub-item";

interface SidebarProps {
  unreadCount: number;
}

export default function Sidebar({ unreadCount }: SidebarProps) {
  const pathname = usePathname();

  // Hide all app chrome during onboarding to keep the wizard focused.
  if (pathname.startsWith("/onboarding")) return null;

  return (
    <aside className="hidden md:flex w-[228px] shrink-0 m-3 rounded-[22px] bg-[color:var(--color-shell-bg)] text-brand-bone flex-col">
      {/* Inner sticky container — items pin to the viewport while the
          charcoal pill background stretches to full height. */}
      <div className="sticky top-3 flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden">
        <div className="px-5 pt-6 pb-4 shrink-0">
          <Link
            href="/dashboard"
            className="inline-block"
            aria-label="inklee — go to dashboard"
          >
            <RandomizedLogo height={20} />
          </Link>
        </div>

        <nav
          aria-label="Primary"
          className="flex-1 overflow-y-auto px-3 pb-6 space-y-6 min-h-0"
        >
          {SIDEBAR_NAV.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-shell-fg-mute)]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const itemActive = isItemActive(pathname, item);
                  const showChildren =
                    item.children && item.children.length > 0 && itemActive;

                  return (
                    <div key={item.href}>
                      <SidebarItem
                        href={item.href}
                        label={item.label}
                        Icon={item.icon}
                        active={itemActive}
                        badgeCount={
                          item.label === "Notifications"
                            ? unreadCount
                            : undefined
                        }
                      />
                      {showChildren && (
                        <div className="mt-0.5 mb-1 space-y-0">
                          {item.children!.map((child) => (
                            <SidebarSubItem
                              key={child.href}
                              href={child.href}
                              label={child.label}
                              active={isItemActive(pathname, child)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

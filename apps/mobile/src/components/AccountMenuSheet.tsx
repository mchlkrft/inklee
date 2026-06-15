import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowUpRight,
  BarChart3,
  LogOut,
  Settings as SettingsIcon,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { Spiderweb } from "./icons/Spiderweb";
import { IconButton } from "./IconButton";
import { TopSheet } from "./TopSheet";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { border, colors } from "@/lib/tokens";
import type { MobileMe, MobileProfile } from "@inklee/shared/mobile-api";

// Account menu behind the top-bar burger — the native equivalent of the web
// top bar's dropdown (mobile-top-bar.tsx). TopSheet owns the slide/fade
// mechanics; an X in the panel's top-right (where the burger lives) closes it.
// Contents mirror the web menu + the one orphaned primary: Settings, Insights,
// View booking form, View flash page, Sign out.
export function AccountMenuSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const meQ = useApiQuery<MobileMe>("/me");
  const profileQ = useApiQuery<MobileProfile>("/settings/profile", {
    enabled: open,
  });
  const [avatarFailed, setAvatarFailed] = useState(false);

  const me = meQ.data;
  const profile = profileQ.data;
  const name = profile?.displayName || me?.displayName || "Your account";
  const slug = me?.slug ?? profile?.slug ?? null;
  const subline = profile?.instagramHandle
    ? `@${profile.instagramHandle}`
    : (profile?.location ?? (slug ? `${slug}.inkl.ee` : null));
  const publicUrl = slug ? config.publicUrl(slug) : null;
  const showLogo = !!profile?.logoUrl && !avatarFailed;

  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const openExternal = (url: string) => {
    void WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  return (
    <TopSheet open={open} onClose={onClose} closeLabel="Close account menu">
      {/* Identity row + the X exactly where the burger sits (top-right),
          so closing is one small thumb move from opening. */}
      <View
        className="flex-row items-center gap-3 pb-4"
        style={{
          borderBottomWidth: border.hairline,
          borderColor: colors.shell.border,
        }}
      >
        {showLogo ? (
          <Image
            source={{ uri: profile!.logoUrl! }}
            onError={() => setAvatarFailed(true)}
            transition={150}
            style={{ width: 44, height: 44, borderRadius: 22 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-mustard/20">
            <Text className="text-lg font-bold text-mustard">
              {name.charAt(0).toUpperCase() || "·"}
            </Text>
          </View>
        )}
        <View className="flex-1 justify-center">
          <Text
            className="text-subtitle font-semibold text-bone"
            numberOfLines={1}
          >
            {name}
          </Text>
          {subline ? (
            // Static shell color: the panel is fixed-dark chrome, so the
            // themed text-shell-dim would vanish in the light theme.
            <Text
              className="text-caption"
              style={{ color: colors.shell.dim }}
              numberOfLines={1}
            >
              {subline}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon={X}
          label="Close menu"
          onPress={onClose}
          outlined
          borderColor={colors.shell.border}
          color={colors.bone}
        />
      </View>

      <View className="pt-2">
        <MenuRow
          icon={SettingsIcon}
          label="Settings"
          onPress={() => go(() => router.push("/settings"))}
        />
        <MenuRow
          icon={BarChart3}
          label="Insights"
          onPress={() => go(() => router.push("/insights"))}
        />
        {publicUrl ? (
          <>
            <MenuRow
              icon={ArrowUpRight}
              label="View booking form"
              external
              onPress={() => go(() => openExternal(publicUrl))}
            />
            <FlashMenuRow
              onPress={() => go(() => openExternal(`${publicUrl}/flash`))}
            />
          </>
        ) : null}
        <MenuRow icon={LogOut} label="Sign out" onPress={() => go(signOut)} />
      </View>
    </TopSheet>
  );
}

function MenuRow({
  icon: Icon,
  label,
  external = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  external?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 py-3 active:opacity-60"
    >
      <Icon size={20} color={colors.shell.dim} />
      <Text className="flex-1 text-body text-bone">{label}</Text>
      {external ? <ArrowUpRight size={16} color={colors.shell.mute} /> : null}
    </Pressable>
  );
}

// Flash row uses the brand Spiderweb instead of a lucide glyph.
function FlashMenuRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 py-3 active:opacity-60"
    >
      <Spiderweb size={20} color={colors.shell.dim} />
      <Text className="flex-1 text-body text-bone">View flash page</Text>
      <ArrowUpRight size={16} color={colors.shell.mute} />
    </Pressable>
  );
}

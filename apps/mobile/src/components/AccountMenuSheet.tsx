import { useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUpRight,
  LogOut,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react-native";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { border, colors, radius } from "@/lib/tokens";
import type { MobileMe, MobileProfile } from "@inklee/shared/mobile-api";

// openURL rejects on Android when nothing can handle the link; swallow it so a
// tap on an external link never throws an unhandled rejection.
const safeOpen = (url: string) => {
  void Linking.openURL(url).catch(() => {});
};

// Bottom sheet behind the top-bar account-menu button — the native equivalent
// of the web top bar's dropdown (mobile-top-bar.tsx): identity header, Settings,
// View public page, Sign out. The /settings/profile fetch is gated on `open` so
// the global top bar stays light until the sheet is actually used.
export function AccountMenuSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
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

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close account menu"
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        {/* Stop taps inside the sheet from closing it. */}
        <Pressable
          onPress={() => {}}
          className="px-5 pt-5"
          style={{
            backgroundColor: colors.charcoal,
            borderTopWidth: border.brand,
            borderColor: colors.shell.border,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            paddingBottom: insets.bottom + 16,
          }}
        >
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
            <View className="flex-1">
              <Text
                className="text-subtitle font-semibold text-bone"
                numberOfLines={1}
              >
                {name}
              </Text>
              {subline ? (
                <Text className="text-caption text-shell-dim" numberOfLines={1}>
                  {subline}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="pt-2">
            <MenuRow
              icon={SettingsIcon}
              label="Settings"
              onPress={() => go(() => router.push("/settings"))}
            />
            {publicUrl ? (
              <MenuRow
                icon={ArrowUpRight}
                label="View public page"
                external
                onPress={() => go(() => safeOpen(publicUrl))}
              />
            ) : null}
            <MenuRow
              icon={LogOut}
              label="Sign out"
              onPress={() => go(signOut)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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

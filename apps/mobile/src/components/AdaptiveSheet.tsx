import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable } from "react-native";
import { themeVars, useThemePreference } from "@/lib/theme";
import { SHEET_MAX, useLayoutClass } from "@/lib/layout";

// Shared sheet container (ME-15). One modal skeleton, two presentations:
//   compact           -> the classic edge-anchored bottom sheet (slide up,
//                        rounded top corners, full width) — visually identical
//                        to the pattern every sheet hand-rolled before.
//   medium/expanded   -> a centered card dialog (fade, all corners rounded,
//                        width capped at SHEET_MAX) — a full-width sheet on a
//                        tablet window reads as a wall of UI.
// Owns, once, the things each sheet used to hand-roll or miss:
//   - themeVars on the root (RN Modals portal OUTSIDE the ThemeProvider —
//     house rule, see memory rn-modal-theme-rule)
//   - onRequestClose (Android back / hardware Escape)
//   - supportedOrientations (iOS Modals default portrait-only; without this a
//     sheet opening on a rotated iPad snaps the whole interface to portrait)
//   - optional keyboard avoidance for sheets with text inputs
// Consumers render ONLY their content; panel padding stays theirs via
// panelClassName so each migrated sheet keeps its exact compact look.
export function AdaptiveSheet({
  visible,
  onClose,
  children,
  panelClassName = "px-4 pb-10 pt-4",
  avoidKeyboard = false,
  closeLabel = "Close",
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Padding/extra classes for the panel; complete literal strings only (NativeWind). */
  panelClassName?: string;
  avoidKeyboard?: boolean;
  closeLabel?: string;
}) {
  const { scheme } = useThemePreference();
  const centered = useLayoutClass() !== "compact";

  const panel = (
    <Pressable
      onPress={() => {}}
      // Touch shield only — as an accessibility element it would collapse the
      // whole sheet into one inert VoiceOver node (review finding).
      accessible={false}
      className={
        centered
          ? "w-full overflow-hidden rounded-3xl border border-shell-border bg-background " +
            panelClassName
          : "rounded-t-3xl border-t border-shell-border bg-background " +
            panelClassName
      }
      style={
        centered
          ? { maxWidth: SHEET_MAX, maxHeight: "90%" }
          : { maxHeight: "90%" }
      }
    >
      {children}
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={centered ? "fade" : "slide"}
      onRequestClose={onClose}
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
    >
      {/* Re-apply theme vars: a RN Modal portals outside the ThemeProvider. */}
      <Pressable
        accessibilityLabel={closeLabel}
        style={themeVars[scheme]}
        className={
          centered
            ? "flex-1 items-center justify-center bg-black/50 px-6"
            : "flex-1 justify-end bg-black/50"
        }
        onPress={onClose}
      >
        {avoidKeyboard ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className={centered ? "w-full items-center" : undefined}
            pointerEvents="box-none"
          >
            {panel}
          </KeyboardAvoidingView>
        ) : (
          panel
        )}
      </Pressable>
    </Modal>
  );
}

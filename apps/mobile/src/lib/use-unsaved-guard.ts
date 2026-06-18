import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, type AlertButton } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";

// Unsaved-changes guard for the detail editors (ME test 2026-06-18). Wraps
// react-navigation's usePreventRemove so a back-press / swipe-back / header-back
// with pending edits prompts "Save / Discard / Keep editing" instead of silently
// dropping the edits. Shared by goods, flash, studio and trip editors so the
// behaviour can't drift.
//
// Intentional navigations (a successful Save, Delete, Create) must NOT prompt:
// they call the returned `leave()` (optionally with a custom navigation), which
// disables the guard for one re-render and then performs the nav, so the prompt
// never fires for the move the user explicitly asked for.
export function useUnsavedGuard(dirty: boolean, onSave?: () => void) {
  const navigation = useNavigation();
  const [leaving, setLeaving] = useState(false);
  // The navigation to run once the guard is disabled. null = a plain goBack.
  const pending = useRef<(() => void) | null>(null);
  // Latest onSave without re-subscribing the prevent-remove listener each render.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  usePreventRemove(dirty && !leaving, ({ data }) => {
    const buttons: AlertButton[] = [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          pending.current = () => navigation.dispatch(data.action);
          setLeaving(true);
        },
      },
    ];
    if (onSaveRef.current) {
      buttons.push({ text: "Save", onPress: () => onSaveRef.current?.() });
    }
    Alert.alert("Unsaved changes", "Save your edits before leaving?", buttons);
  });

  // Runs after the re-render that flips the guard off, so the navigation goes
  // through instead of re-triggering the prompt.
  useEffect(() => {
    if (!leaving) return;
    const fn = pending.current;
    pending.current = null;
    if (fn) fn();
    else navigation.goBack();
  }, [leaving, navigation]);

  /** Leave WITHOUT prompting. Call from a successful save/delete/create. With no
   *  argument it pops back; pass a navigation fn for a forward move (e.g. a
   *  router.replace into a freshly created record). */
  const leave = useCallback((nav?: () => void) => {
    pending.current = nav ?? null;
    setLeaving(true);
  }, []);

  return { leave };
}

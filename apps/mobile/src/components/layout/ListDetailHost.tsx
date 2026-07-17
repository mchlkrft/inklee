import { createContext, useContext, type ReactNode } from "react";
import { View } from "react-native";
import { PANE } from "@/lib/layout";

// Generic two-pane list-detail container for the expanded window class
// (ME-15 Phase 3). The LIST keeps its full existing tree; the DETAIL renders
// the selected item's content component inline (state-driven — the pushed
// detail route stays the compact path and the deep-link fallback, so the
// route tree never changes).
//
// Contract for hosts:
//   - key the `detail` element by the selection (fresh scroll + local state
//     per selection; stale-notes class of bugs is impossible by construction)
//   - selection lives on the LIST route (a `selected` search param), so the
//     shrink-to-compact transition can promote it to a pushed route (Rule B)
//   - pane width is owned HERE; never re-pad or cap inside the list pane
//     (the bookings full-bleed band trick depends on the pane edge being the
//     container edge)
export const DetailPaneContext = createContext<{
  embedded: boolean;
  close: () => void;
}>({ embedded: false, close: () => {} });

export function useDetailPane() {
  return useContext(DetailPaneContext);
}

export function ListDetailHost({
  list,
  detail,
  empty,
  onClose,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  /** Shown in the detail pane while nothing is selected. */
  empty: ReactNode;
  /** Clears the selection (pane header X, or after a destructive action). */
  onClose: () => void;
}) {
  return (
    <View className="flex-1 flex-row">
      <View style={{ width: PANE.list }}>{list}</View>
      <View className="border-l border-shell-border" />
      <View className="flex-1">
        {detail ? (
          <DetailPaneContext.Provider value={{ embedded: true, close: onClose }}>
            <View
              className="flex-1 self-center"
              style={{ width: "100%", maxWidth: PANE.detailContent }}
            >
              {detail}
            </View>
          </DetailPaneContext.Provider>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            {empty}
          </View>
        )}
      </View>
    </View>
  );
}

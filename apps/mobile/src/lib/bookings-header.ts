import { createContext, useContext } from "react";

// Total top inset the bookings sub-screens (requests / calendar / clients)
// pad their scroll content by: the TopBar band plus the pinned title/sub-nav
// band the bookings layout measures and provides. The sub-screens scroll under
// both; the bands reclaim the TopBar's space when it scroll-hides.
export const BookingsHeaderInsetContext = createContext(0);

export function useBookingsHeaderInset(): number {
  return useContext(BookingsHeaderInsetContext);
}

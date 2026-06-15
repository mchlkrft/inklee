// Tiny client-side store for the booking-time interest selections. ShopTeaser
// (rendered in the page header) and BookingForm (rendered in the main section)
// both consume this context: the shop overlay writes to it as the client picks
// items, and the booking form reads it on submit to serialise the selections
// into the form data.
//
// Falls back to an empty/no-op store when no provider is mounted so either
// component can still be rendered in isolation (tests, future surfaces).

"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { InterestSelection } from "@/lib/booking-interests";

type InterestSelectionsContextValue = {
  selections: InterestSelection[];
  setSelections: (next: InterestSelection[]) => void;
};

const InterestSelectionsContext =
  createContext<InterestSelectionsContextValue | null>(null);

export function InterestSelectionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selections, setSelections] = useState<InterestSelection[]>([]);
  return (
    <InterestSelectionsContext.Provider value={{ selections, setSelections }}>
      {children}
    </InterestSelectionsContext.Provider>
  );
}

const EMPTY: InterestSelectionsContextValue = {
  selections: [],
  setSelections: () => {},
};

export function useInterestSelections(): InterestSelectionsContextValue {
  return useContext(InterestSelectionsContext) ?? EMPTY;
}

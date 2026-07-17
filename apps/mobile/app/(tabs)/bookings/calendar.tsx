import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { DayAgenda } from "@/components/calendar/DayAgenda";
import { useCalendarMonth } from "@/lib/calendar";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { useBookingsHeaderInset } from "@/lib/bookings-header";
import { CAP, useIsExpanded, useTabBarClearance } from "@/lib/layout";
import { useScreenView } from "@/lib/analytics";

// Month grid of confirmed appointments, guest spots and flash days + the
// selected day's agenda (web-calendar marker parity, ME-6). Tapping an
// appointment opens the booking detail; guest-spot/flash rows open their
// editors; the CTA below creates an artist-authored appointment
// (/bookings/new). Slot publishing lives in Settings > Time slots.
//
// ME-15: at the expanded window class the month and the agenda sit side by
// side (independent scrolling); the selected date is plain component state in
// useCalendarMonth, so it survives rotation/resize between the two layouts
// with zero reconciliation. Portrait tablets (medium) keep the stacked layout
// on purpose - vertical space is plentiful there (decision D5).
export default function CalendarScreen() {
  useScreenView("calendar");
  const cal = useCalendarMonth();
  const router = useRouter();
  const themed = useColors();
  const onScroll = useScrollHide();
  const headerInset = useBookingsHeaderInset();
  const tabBarClearance = useTabBarClearance();
  const expanded = useIsExpanded();

  const cta = (
    // Founder round 4: full md-height CTA (was an undersized sm).
    <View className="pb-4">
      <Button
        label="New appointment"
        onPress={() => router.push(`/bookings/new?date=${cal.selectedDate}`)}
      />
    </View>
  );
  const month = (
    <MonthGrid
      monthLabel={cal.monthLabel}
      weeks={cal.weeks}
      selectedDate={cal.selectedDate}
      onSelectDay={cal.selectDay}
      onPrev={cal.goPrevMonth}
      onNext={cal.goNextMonth}
    />
  );
  const agenda = cal.error ? (
    <EmptyState title="Couldn't load calendar" subtitle={cal.error} />
  ) : cal.loading ? (
    <View className="items-center py-8">
      <ActivityIndicator color={themed.accent} />
    </View>
  ) : (
    <DayAgenda
      dateKey={cal.selectedDate}
      appointments={cal.selectedAppointments}
      guestSpots={cal.selectedGuestSpots}
      flashDays={cal.selectedFlashDays}
    />
  );
  const refreshControl = (
    <RefreshControl
      refreshing={cal.refreshing}
      onRefresh={cal.refresh}
      tintColor={themed.accent}
      progressViewOffset={expanded ? 0 : headerInset}
    />
  );

  if (expanded) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 flex-row" style={{ paddingTop: headerInset }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ width: 420, flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: tabBarClearance }}
            refreshControl={refreshControl}
          >
            {cta}
            {month}
          </ScrollView>
          <View className="w-6" />
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: tabBarClearance }}
          >
            <View style={{ width: "100%", maxWidth: CAP.feed }}>{agenda}</View>
          </ScrollView>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerInset,
          paddingBottom: tabBarClearance,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
      >
        {cta}
        {month}
        <View className="mt-5">{agenda}</View>
      </ScrollView>
    </Screen>
  );
}

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
import { colors } from "@/lib/tokens";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";
import { useScreenView } from "@/lib/analytics";

// Month grid of confirmed appointments + the selected day's agenda. Tapping an
// appointment opens the shared booking detail screen; the CTA below creates an
// artist-authored appointment (/bookings/new). Trips, flash and slots remain
// web-only (the mobile calendar endpoint is approved-bookings-only).
export default function CalendarScreen() {
  useScreenView("calendar");
  const cal = useCalendarMonth();
  const router = useRouter();

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={cal.refreshing}
            onRefresh={cal.refresh}
            tintColor={colors.mustard}
          />
        }
      >
        {/* Founder round 4: full md-height CTA (was an undersized sm). */}
        <View className="pb-4">
          <Button
            label="New appointment"
            onPress={() =>
              router.push(`/bookings/new?date=${cal.selectedDate}`)
            }
          />
        </View>
        <MonthGrid
          monthLabel={cal.monthLabel}
          weeks={cal.weeks}
          selectedDate={cal.selectedDate}
          onSelectDay={cal.selectDay}
          onPrev={cal.goPrevMonth}
          onNext={cal.goNextMonth}
        />

        <View className="mt-5">
          {cal.error ? (
            <EmptyState title="Couldn't load calendar" subtitle={cal.error} />
          ) : cal.loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.mustard} />
            </View>
          ) : (
            <DayAgenda
              dateKey={cal.selectedDate}
              appointments={cal.selectedAppointments}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

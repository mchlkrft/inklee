import { Text } from "react-native";
import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";

// Clients (+ waitlist) lands in slice E6. Tab present now for the real shell.
export default function ClientsScreen() {
  return (
    <Screen>
      <Text className="py-2 text-2xl font-bold text-bone">Clients</Text>
      <EmptyState
        title="Coming soon"
        subtitle="People who've booked with you will be collected here."
      />
    </Screen>
  );
}

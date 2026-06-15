import { Text } from "react-native";

// Form-field label for inputs that don't carry their own (TextArea, Segmented,
// pickers). One definition for what was five byte-identical local `Label`
// components across the edit screens.
export function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-sm font-medium text-foreground">
      {children}
    </Text>
  );
}

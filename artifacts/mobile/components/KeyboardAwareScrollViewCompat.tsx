import { KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps } from "react-native";

type Props = ScrollViewProps & {
  children: React.ReactNode;
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
  return (
    <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
      {children}
    </ScrollView>
  );
}

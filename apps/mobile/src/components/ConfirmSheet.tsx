import { Text, View } from "react-native";
import { text } from "@/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

// "Are you sure?" for destructive actions (delete projects, clips). Not drawn in
// the designs; a bottom sheet with the danger button first, Cancel second.
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <Text style={text.caption}>{body}</Text>
      <View style={{ gap: 8 }}>
        <Button label={confirmLabel} variant="danger" size="sm" fullWidth loading={busy} onPress={onConfirm} />
        <Button label="Cancel" variant="secondary" size="sm" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

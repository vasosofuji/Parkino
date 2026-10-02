import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  View,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme, lightColors, type ThemeColors } from "../state/ThemeContext";
import ModalBackdrop from "./ModalBackdrop";
type HeaderBackAction = { onPress: () => void; label: string; disabled?: boolean };
const SheetBackContext = createContext<((action: HeaderBackAction | null) => void) | null>(null);
/** Register the active form's Back action without moving it into the scrollable body. */
export function useSheetBack(action: HeaderBackAction) {
  const register = useContext(SheetBackContext), current = useRef(action);
  useLayoutEffect(() => { current.current = action; });
  useLayoutEffect(() => {
    register?.({ onPress: () => current.current.onPress(), label: action.label, disabled: action.disabled });
    return () => register?.(null);
  }, [register, action.label, action.disabled]);
}
export const colors = lightColors;
export type IconName = React.ComponentProps<typeof Feather>["name"];
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <Feather name={name} size={size} color={color ?? colors.ink} />;
}
export function Button({
  title,
  onPress,
  icon,
  variant = "primary",
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === "primary"
          ? s.primary
          : variant === "danger"
            ? s.danger
            : s.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          color={
            variant === "primary"
              ? "#fff"
              : variant === "danger"
                ? colors.red
                : colors.ink
          }
        />
      ) : null}
      <Text
        style={[
          s.buttonText,
          {
            color:
              variant === "primary"
                ? "#fff"
                : variant === "danger"
                  ? colors.red
                  : colors.ink,
          },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled,
  compact = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      hitSlop={name === "x" || compact ? 6 : 2}
      style={[s.iconButton, (name === "x" || compact) && s.closeButton, disabled && { opacity: 0.45 }]}
    >
      <Icon name={name} size={name === "x" ? 16 : 20} />
    </Pressable>
  );
}
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  onDismiss,
  onShow,
  onBack,
  backLabel = "Back / Назад",
  backDisabled,
  fullPage = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onDismiss?: () => void;
  onShow?: () => void;
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  fullPage?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [registeredBack, registerBack] = useState<HeaderBackAction | null>(null);
  const back = registeredBack ?? (onBack ? { onPress: onBack, label: backLabel, disabled: backDisabled } : null);
  return (
    <SheetBackContext.Provider value={registerBack}>
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={fullPage && back ? () => { if (!back.disabled) back.onPress(); } : onClose}
      onDismiss={onDismiss}
      onShow={onShow}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          s.overlay,
          {
            paddingTop: fullPage ? insets.top : Math.max(12, insets.top),
            paddingBottom: fullPage ? insets.bottom : Math.max(12, insets.bottom),
            ...(fullPage ? { paddingHorizontal: 0, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: colors.paper } : {}),
          },
        ]}
      >
        {!fullPage ? <ModalBackdrop /> : null}
        {!fullPage ? <Pressable
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        /> : null}
        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              maxHeight:
                height - Math.max(12, insets.top) - Math.max(12, insets.bottom),
            },
            fullPage && { flex: 1, maxHeight: undefined, maxWidth: undefined, borderRadius: 0, borderWidth: 0 },
          ]}
        >
          <View style={s.sheetTop}>
            {fullPage ? <View style={{ width: 44 }}>{back ? <IconButton name="arrow-left" label={back.label} disabled={back.disabled} onPress={back.onPress} /> : null}</View> : null}
            <Text accessibilityRole="header" style={[s.sheetTitle, fullPage && { textAlign: "center" }]}>
              {title}
            </Text>
            {!fullPage && back ? <IconButton name="arrow-left" compact label={back.label} disabled={back.disabled} onPress={back.onPress} /> : null}
            <View style={fullPage ? { width: 44, alignItems: "center" } : undefined}><IconButton name="x" label="Close / Затвори" onPress={onClose} /></View>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            bounces={false}
            style={fullPage ? { flex: 1 } : { flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[s.sheetContent, fullPage && { width: "100%", maxWidth: 680, alignSelf: "center", gap: 20, paddingBottom: 28 }]}
          >
            {children}
          </ScrollView>
          {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </SheetBackContext.Provider>
  );
}
export function Note({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return <Text style={s.note}>{children}</Text>;
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    primary: { backgroundColor: colors.green },
    secondary: { backgroundColor: colors.mint },
    danger: { backgroundColor: "#FBEDEC" },
    buttonText: { fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "center" },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.mint,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: "transparent" },
    overlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    sheet: {
      backgroundColor: colors.paper,
      borderRadius: 18,
      width: "100%",
      maxWidth: 520,
      flexShrink: 1,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.line,
    },
    sheetTop: {
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    sheetTitle: { flex: 1, fontWeight: "700", fontSize: 18, color: colors.ink },
    sheetContent: { padding: 16, gap: 10 },
    sheetFooter: {
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      gap: 6,
    },
    note: { fontSize: 13, lineHeight: 20, color: colors.muted },
  });

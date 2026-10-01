import React, { useMemo } from "react";
import { PanResponder, Pressable, View } from "react-native";
import type { DrawerHandleProps } from "./drawerHandleTypes";
export default function DrawerHandle(props: DrawerHandleProps) {
  const { onStart, onDrag, onEnd } = props;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: onStart,
        onPanResponderMove: (_, g) => onDrag(g.dy),
        onPanResponderRelease: (_, g) => onEnd(g.vy),
        onPanResponderTerminate: () => onEnd(0),
      }),
    [onStart, onDrag, onEnd],
  );
  return (
    <View {...pan.panHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label}
        accessibilityState={{ expanded: props.open }}
        onPress={props.onToggle}
        style={{ height: 30, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 8,
            opacity: 0.45,
            backgroundColor: props.color,
          }}
        />
      </Pressable>
    </View>
  );
}

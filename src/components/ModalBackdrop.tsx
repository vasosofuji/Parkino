import React, { createContext, useContext, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";

const Target = createContext<React.RefObject<View | null> | undefined>(undefined);

export function ModalBackgroundProvider({ children }: { children: React.ReactNode }) {
  const target = useRef<View | null>(null);
  return (
    <Target.Provider value={target}>
      <BlurTargetView ref={target} style={{ flex: 1 }}>{children}</BlurTargetView>
    </Target.Provider>
  );
}

export default function ModalBackdrop() {
  const target = useContext(Target);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        blurTarget={target}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={18}
        tint="default"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(32,23,19,0.48)" }]} />
    </View>
  );
}

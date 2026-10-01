import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

/** One entrance for a selected popup; map projection updates never restart it. */
export function useParkingPopupMotion(visible: boolean) {
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const entered = useRef(false);
  useEffect(() => {
    let mounted = true, changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      if (mounted) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted && !changed) setReduceMotion(value); })
      .catch(() => { if (mounted && !changed) setReduceMotion(true); });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!visible || reduceMotion === null) {
      if (entered.current) progress.setValue(1);
      return;
    }
    if (entered.current || reduceMotion) {
      entered.current = true;
      progress.setValue(1);
      return;
    }
    entered.current = true;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 200, easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web", isInteraction: false,
    });
    animation.start();
    return () => { animation.stop(); progress.stopAnimation(); };
  }, [progress, reduceMotion, visible]);
  const style = useMemo(() => ({
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  }), [progress]);
  return { ready: reduceMotion !== null, style };
}

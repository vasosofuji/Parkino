import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  ArrivalDetector,
  containsParkingFix,
  type Fix,
} from "../domain/arrival";
import { preferFix, usableFix } from "../domain/location";
import type { Coordinate, ParkingPlace } from "../domain/types";
import { watchLocation } from "../services/location";
import type { LocationIssue } from "../domain/locationWatch";

export function useArrival(places: ParkingPlace[]) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [initialLocation, setInitialLocation] = useState<Coordinate | null>(
    null,
  );
  const [arrival, setArrival] = useState<ParkingPlace | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "approximate" | "denied" | "error"
  >("loading");
  const [retry, setRetry] = useState(0);
  const [issue, setIssue] = useState<LocationIssue | null>(null);
  const latest = useRef(places);
  useEffect(() => {
    latest.current = places;
  }, [places]);
  const detector = useRef(new ArrivalDetector());
  useEffect(() => {
    let active = true,
      previous: Fix | null = null,
      initialAccuracy = Infinity;
    let stop: (() => void) | undefined;
    const arrivalDetector = detector.current;
    function fail(value: LocationIssue) {
      if (!active) return;
      if (__DEV__ && value.detail)
        console.warn("Location provider:", value.code, value.detail);
      setIssue(value);
      if (previous && Date.now() - previous.timestamp < 30000) return;
      previous = null;
      setFix(null);
      setArrival(null);
      arrivalDetector.reset();
      setStatus(
        value.code === "denied" || value.code === "blocked"
          ? "denied"
          : "error",
      );
    }
    const stale = setInterval(() => {
      if (previous && Date.now() - previous.timestamp > 30000)
        fail({ code: "timeout" });
    }, 5000);
    const appState = AppState.addEventListener("change", (state) => {
      arrivalDetector.reset();
      if (state !== "active") {
        previous = null;
        setFix(null);
        setArrival(null);
        stop?.();
      } else {
        setStatus("loading");
        setIssue(null);
        setRetry((value) => value + 1);
      }
    });
    void watchLocation((next) => {
      if (
        !active ||
        AppState.currentState === "background" ||
        AppState.currentState === "inactive"
      )
        return;
      if (!usableFix(next) || !preferFix(previous, next)) return;
      previous = next;
      setFix(next);
      setIssue(null);
      setStatus(next.accuracy! > 50 ? "approximate" : "ready");
      if (initialAccuracy > 50 && next.accuracy! < initialAccuracy) {
        initialAccuracy = next.accuracy!;
        setInitialLocation({
          latitude: next.latitude,
          longitude: next.longitude,
        });
      }
      const parked = arrivalDetector.update(next, latest.current);
      setArrival((current) =>
        current &&
        (next.accuracy! > 25 ||
          (next.speed !== null && next.speed > 0.8) ||
          !containsParkingFix(next, current))
          ? null
          : current,
      );
      if (parked) setArrival(parked);
    }, fail)
      .then((remove) => {
        stop = remove;
        if (!active || AppState.currentState === "background") remove();
      })
      .catch(() => fail({ code: "unavailable" }));
    return () => {
      active = false;
      clearInterval(stale);
      stop?.();
      appState.remove();
      arrivalDetector.reset();
    };
  }, [retry]);
  return {
    location: fix,
    accuracy: fix?.accuracy ?? null,
    initialLocation,
    arrival,
    status,
    issue,
    dismiss: () => setArrival(null),
    retry: () => {
      setStatus("loading");
      setIssue(null);
      setRetry((n) => n + 1);
    },
  };
}

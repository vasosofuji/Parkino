import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { currentAvailability, SKOPJE } from "../domain/parking";
import { groupParking } from "../domain/clusters";
import type { ParkingMapProps } from "./mapTypes";
import { mapHtml } from "./offlineMapHtml";
const SOURCE = { html: mapHtml };
const ORIGINS = ["*"];
export default function OpenStreetParkingMap(props: ParkingMapProps) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(15);
  const [failed, setFailed] = useState(false);
  const payload = useMemo(() => {
    const longitudeStep = zoom < 18 ? (120 * 360) / (256 * 2 ** zoom) : 0;
    const latitudeStep =
      longitudeStep * Math.cos((SKOPJE.latitude * Math.PI) / 180);
    const pins = groupParking(
      props.drawing ? [] : props.places,
      latitudeStep,
      longitudeStep,
      props.selectedId,
    ).map((members) => {
      const place = members[0];
      const availability = currentAvailability(place.availability);
      const cluster = members.length > 1;
      let color = place.access === "restricted" ? "#88948D" : "#392c25";
      if (!cluster && availability.status === "spaces") color = "#087958";
      if (!cluster && availability.status === "full") color = "#B83A36";
      return {
        id: place.id,
        point: [place.coordinate.latitude, place.coordinate.longitude],
        title:
          props.language === "en" ? (place.nameEn ?? place.name) : place.name,
        label: String(cluster ? members.length : "P"),
        color,
        cluster,
        selected: place.id === props.selectedId,
        spaces: !cluster && availability.status === "spaces",
      };
    });
    return {
      pins,
      dark: props.dark,
      drawing: props.drawing,
      userAccuracy: props.userAccuracy,
      destinationName:
        props.destinationName ??
        (props.language === "mk" ? "Дестинација" : "Destination"),
      cornerLabel: props.language === "mk" ? "Агол " : "Corner ",
      draft: (props.draftCoordinates ?? []).map((p) => [
        p.latitude,
        p.longitude,
      ]),
      zoneLabels:
        props.showZones && !props.drawing
          ? props.places
              .filter(
                (p) =>
                  p.kind === "zone" &&
                  (zoom >= 17 || p.id === props.selectedId),
              )
              .map((p) => ({
                id: p.id,
                point: [p.coordinate.latitude, p.coordinate.longitude],
                label: p.zoneCode ?? p.name,
                title: p.name,
                approximate: !p.geometry,
              }))
          : [],
      destinationMarker:
        props.destinationMarker === undefined
          ? [props.destination.latitude, props.destination.longitude]
          : props.destinationMarker
            ? [
                props.destinationMarker.latitude,
                props.destinationMarker.longitude,
              ]
            : null,
      footprints: !props.drawing ? props.places.filter((p) => p.kind !== "zone" && p.geometry && (zoom >= 17 || p.id === props.selectedId)).map((p) => ({
        id: p.id, selected: p.id === props.selectedId,
        rings: p.geometry!.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng])),
      })) : [],
      zones:
        props.showZones && !props.drawing
          ? props.places
              .filter((p) => p.kind === "zone" && p.geometry)
              .map((p) => ({
                id: p.id,
                rings: p.geometry!.coordinates.map((ring) =>
                  ring.map(([lng, lat]) => [lat, lng]),
                ),
              }))
          : [],
      destination: [props.destination.latitude, props.destination.longitude],
      cameraRevision: props.cameraRevision,
      userLocation: props.userLocation
        ? [props.userLocation.latitude, props.userLocation.longitude]
        : null,
      selectedId: props.selectedId,
      selectedAnchor: props.selectedAnchor
        ? [props.selectedAnchor.latitude, props.selectedAnchor.longitude]
        : null,
      selectionEnabled: props.selectionEnabled,
      picking: props.picking,
    };
  }, [
    props.dark,
    props.drawing,
    props.userAccuracy,
    props.destinationName,
    props.draftCoordinates,
    props.destinationMarker,
    props.places,
    props.selectedId,
    props.selectedAnchor,
    props.selectionEnabled,
    props.language,
    props.showZones,
    props.destination,
    props.cameraRevision,
    props.userLocation,
    props.picking,
    zoom,
  ]);
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
    web.current?.injectJavaScript(
      `window.renderParking && window.renderParking(${serialized});true;`,
    );
  }, [payload, ready]);
  function receive(event: WebViewMessageEvent) {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.type === "ready") setReady(true);
    if (
      message.type === "zoom" &&
      Number.isFinite(message.zoom) &&
      message.zoom >= 3 &&
      message.zoom <= 19
    )
      setZoom(message.zoom);
    if (message.type === "pan") props.onPan?.();
    if (message.type === "blank") props.onBlankPress?.();
    if (message.type === "position") {
      if (message.point === null) props.onSelectedPosition?.(null);
      else if (
        Number.isFinite(message.point?.x) &&
        Number.isFinite(message.point?.y)
      )
        props.onSelectedPosition?.(message.point);
    }
    if (
      message.type === "center" &&
      Number.isFinite(message.latitude) &&
      Number.isFinite(message.longitude)
    )
      props.onCenterChange?.({
        latitude: message.latitude,
        longitude: message.longitude,
      });
    if (message.type === "select") {
      const place = props.places.find((p) => p.id === message.id);
      if (place && props.selectionEnabled !== false)
        props.onSelect(
          place,
          Number.isFinite(message.latitude) &&
            Number.isFinite(message.longitude)
            ? { latitude: message.latitude, longitude: message.longitude }
            : place.coordinate,
        );
    }
    if (
      (message.type === "pick" || message.type === "vertex") &&
      props.picking &&
      Number.isFinite(message.latitude) &&
      Number.isFinite(message.longitude) &&
      Math.abs(message.latitude) <= 90 &&
      Math.abs(message.longitude) <= 180
    ) {
      const point = {
        latitude: message.latitude,
        longitude: message.longitude,
      };
      if (message.type === "pick") props.onPick(point);
      else if (
        props.drawing &&
        Number.isInteger(message.index) &&
        message.index >= 0 &&
        message.index < (props.draftCoordinates?.length ?? 0)
      )
        props.onMoveVertex?.(message.index, point);
    }
  }
  return (
    <View style={styles.container}>
      <WebView
        ref={web}
        style={styles.container}
        source={SOURCE}
        originWhitelist={ORIGINS}
        onMessage={receive}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        applicationNameForUserAgent="ParkSkopje-local-preview/1.0"
        onShouldStartLoadWithRequest={(request) =>
          request.url === "about:blank" ||
          request.url.startsWith("data:text/html")
        }
        onError={() => setFailed(true)}
      />
      {failed ? (
        <View style={styles.error}>
          <Text>
            {props.language === "mk"
              ? "Мапата не може да се отвори. Проверете ја врската."
              : "The map could not load. Check your connection."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ede2d0" },
  error: {
    position: "absolute",
    top: 70,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
  },
});

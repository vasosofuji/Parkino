import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, {
  Marker,
  Polygon,
  Polyline,
  Circle,
  type Region,
} from "react-native-maps";
import { groupParking } from "../domain/clusters";
import type { ParkingMapProps } from "./mapTypes";
import { SKOPJE, currentAvailability } from "../domain/parking";
export default function ParkingMap(props: ParkingMapProps) {
  const map = useRef<MapView>(null);
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);
  const projectionVersion = useRef(0);
  const projectSelection = React.useCallback(async () => {
    const p = callbacks.current,
      revision = ++projectionVersion.current;
    if (!p.selectedId || !p.selectedAnchor || !map.current) {
      p.onSelectedPosition?.(null);
      return;
    }
    try {
      const point = await map.current.pointForCoordinate(p.selectedAnchor);
      if (revision === projectionVersion.current)
        callbacks.current.onSelectedPosition?.(point);
    } catch {
      callbacks.current.onSelectedPosition?.(null);
    }
  }, []);
  const [region, setRegion] = useState<Region>({
    ...SKOPJE,
    latitudeDelta: 0.035,
    longitudeDelta: 0.035,
  });
  useEffect(() => {
    map.current?.animateToRegion(
      {
        latitude: props.destination.latitude,
        longitude: props.destination.longitude,
        latitudeDelta: 0.022,
        longitudeDelta: 0.022,
      },
      200,
    );
  }, [
    props.destination.latitude,
    props.destination.longitude,
    props.cameraRevision,
  ]);
  useEffect(() => {
    void projectSelection();
  }, [props.selectedId, props.selectedAnchor, projectSelection]);
  const visible = props.places.filter(
    (p) =>
      p.kind !== "zone" &&
      Math.abs(p.coordinate.latitude - region.latitude) <
        region.latitudeDelta / 1.5 &&
      Math.abs(p.coordinate.longitude - region.longitude) <
        region.longitudeDelta / 1.5,
  );
  // Group dense pins into spatial cells; every facility stays reachable by zoom or the list.
  const step = region.latitudeDelta > 0.003 ? region.latitudeDelta / 5 : 0;
  const groups = groupParking(
    props.drawing ? [] : visible,
    step,
    step,
    props.selectedId,
  );
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      userInterfaceStyle={props.dark ? "dark" : "light"}
      mapPadding={{ bottom: 0, top: 0, left: 0, right: 0 }}
      moveOnMarkerPress={false}
      onRegionChange={() => {
        projectionVersion.current++;
        props.onSelectedPosition?.(null);
      }}
      onRegionChangeComplete={(next) => {
        setRegion(next);
        props.onCenterChange?.({
          latitude: next.latitude,
          longitude: next.longitude,
        });
        void projectSelection();
      }}
      onPanDrag={props.onPan}
      zoomControlEnabled={false}
      showsPointsOfInterests={false}
      onPress={(event) => {
        if (props.picking) props.onPick(event.nativeEvent.coordinate);
        else if (event.nativeEvent.action !== "marker-press")
          props.onBlankPress?.();
      }}
    >
      {!props.drawing ? visible.filter((p) => p.geometry && (region.latitudeDelta < 0.007 || p.id === props.selectedId)).map((place) => (
        <Polygon key={"area:" + place.id}
          coordinates={place.geometry!.coordinates[0].map(([longitude, latitude]) => ({ latitude, longitude }))}
          holes={place.geometry!.coordinates.slice(1).map((ring) => ring.map(([longitude, latitude]) => ({ latitude, longitude })))}
          strokeColor="#962E2B" fillColor={place.id === props.selectedId ? "#962E2B20" : "#962E2B0B"} strokeWidth={place.id === props.selectedId ? 2.5 : 1.5}
          tappable onPress={(event) => { if (props.selectionEnabled !== false) props.onSelect(place, event.nativeEvent.coordinate ?? place.coordinate); }}
        />
      )) : null}
      {props.showZones && !props.drawing
        ? props.places
            .filter((p) => p.kind === "zone" && p.geometry)
            .map((place) => (
              <Polygon
                key={place.id}
                coordinates={place.geometry!.coordinates[0].map(
                  ([longitude, latitude]) => ({ latitude, longitude }),
                )}
                strokeColor="#527FBA"
                fillColor="rgba(82,127,186,0.035)"
                strokeWidth={1}
                lineDashPattern={[5, 5]}
                tappable
                onPress={(event) => {
                  if (props.picking) {
                    if (event.nativeEvent.coordinate)
                      props.onPick(event.nativeEvent.coordinate);
                  } else if (props.selectionEnabled !== false)
                    props.onSelect(
                      place,
                      event.nativeEvent.coordinate ?? place.coordinate,
                    );
                }}
              />
            ))
        : null}
      {props.showZones && !props.drawing
        ? props.places
            .filter(
              (p) =>
                p.kind === "zone" &&
                (region.latitudeDelta < 0.007 || p.id === props.selectedId),
            )
            .map((p) => (
              <Marker
                key={"label:" + p.id}
                coordinate={p.coordinate}
                accessibilityLabel={p.name}
                onPress={() =>
                  props.picking
                    ? props.onPick(p.coordinate)
                    : props.selectionEnabled !== false && props.onSelect(p)
                }
              >
                <View
                  style={[
                    s.pin,
                    { backgroundColor: "#fff", borderColor: "#527FBA" },
                  ]}
                >
                  <Text style={{ color: "#392c25", fontWeight: "700" }}>
                    {p.zoneCode}
                  </Text>
                </View>
              </Marker>
            ))
        : null}
      {groups.map((group) => {
        const key = group[0].id;
        const place = group.find((p) => p.id === props.selectedId) ?? group[0],
          availability = currentAvailability(place.availability);
        const color =
          availability.status === "spaces"
            ? "#087958"
            : availability.status === "full"
              ? "#B83A36"
              : place.access === "restricted"
                ? "#88948D"
                : "#392c25";
        return (
          <Marker
            key={key}
            coordinate={place.coordinate}
            zIndex={
              place.id === props.selectedId
                ? 1000
                : availability.status === "spaces"
                  ? 800
                  : 0
            }
            accessibilityLabel={
              props.language === "en"
                ? (place.nameEn ?? place.name)
                : place.name
            }
            onPress={() => {
              if (props.picking) props.onPick(place.coordinate);
              else if (props.selectionEnabled === false) return;
              else if (
                group.length > 1 &&
                !group.some((p) => p.id === props.selectedId)
              )
                map.current?.animateToRegion(
                  {
                    ...place.coordinate,
                    latitudeDelta: region.latitudeDelta / 2,
                    longitudeDelta: region.longitudeDelta / 2,
                  },
                  200,
                );
              else props.onSelect(place);
            }}
          >
            <View
              style={[
                s.pin,
                { backgroundColor: color },
                place.id === props.selectedId ? s.selected : null,
                availability.status === "spaces" && group.length === 1
                  ? s.spaces
                  : null,
              ]}
            >
              <Text style={s.pinText}>
                {group.length > 1
                  ? group.length
                  : availability.status === "spaces"
                    ? "P ✓"
                    : "P"}
              </Text>
            </View>
          </Marker>
        );
      })}
      {(props.draftCoordinates?.length ?? 0) > 1 ? (
        <Polyline
          coordinates={props.draftCoordinates!}
          strokeColor="#962e2b"
          strokeWidth={3}
        />
      ) : null}
      {(props.draftCoordinates?.length ?? 0) > 2 ? (
        <Polygon
          coordinates={props.draftCoordinates!}
          strokeColor="#962e2b"
          fillColor="rgba(0,107,87,0.15)"
        />
      ) : null}
      {props.draftCoordinates?.map((point, i) => (
        <Marker
          key={"draft:" + i}
          coordinate={point}
          anchor={{ x: 0.5, y: 0.5 }}
          draggable={props.drawing}
          zIndex={3000}
          title={(props.language === "mk" ? "Агол " : "Corner ") + (i + 1)}
          onDragEnd={(event) =>
            props.onMoveVertex?.(i, event.nativeEvent.coordinate)
          }
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#962e2b",
              borderWidth: 2,
              borderColor: "#fff",
            }}
          />
        </Marker>
      ))}
      {!props.drawing &&
      (props.destinationMarker === undefined || props.destinationMarker) ? (
        <Marker
          coordinate={props.destinationMarker ?? props.destination}
          anchor={{ x: 0.5, y: 1 }}
          zIndex={2000}
          title={
            props.destinationName ??
            (props.language === "mk" ? "Дестинација" : "Destination")
          }
        >
          <View style={s.destination}>
            <Text numberOfLines={1} style={s.destinationText}>
              {props.destinationName ??
                (props.language === "mk" ? "Дестинација" : "Destination")}
            </Text>
            <View style={s.destinationDot} />
            <View style={s.destinationTip} />
          </View>
        </Marker>
      ) : null}
      {props.userLocation ? (
        <>
          {props.userAccuracy ? (
            <Circle
              center={props.userLocation}
              radius={props.userAccuracy}
              strokeColor="#3977D5"
              strokeWidth={1}
              fillColor="rgba(57,119,213,0.08)"
            />
          ) : null}
          <Marker
            coordinate={props.userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={1500}
          >
            <View style={s.userDot} />
          </Marker>
        </>
      ) : null}
    </MapView>
  );
}
const s = StyleSheet.create({
  pin: {
    minWidth: 26,
    height: 26,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pinText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  selected: { borderColor: "#d9a48d", borderWidth: 3 },
  spaces: {
    minWidth: 44,
    height: 32,
    borderRadius: 16,
    borderColor: "#b5f5d0",
    borderWidth: 3,
    backgroundColor: "#07874f",
  },
  userDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#3977D5",
    borderColor: "#fff",
    borderWidth: 3,
  },
  destination: { alignItems: "center", maxWidth: 210 },
  destinationText: {
    color: "#8e1822",
    fontWeight: "700",
    fontSize: 12,
    backgroundColor: "#fff",
    padding: 7,
    borderRadius: 8,
    marginBottom: 4,
  },
  destinationDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ce383e",
    borderWidth: 3,
    borderColor: "#fff",
  },
  destinationTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#ce383e",
    marginTop: -4,
  },
});

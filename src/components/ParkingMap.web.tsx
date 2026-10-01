import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "./leaflet.css";
import "./map.css";
import type { ParkingMapProps } from "./mapTypes";
import { currentAvailability, SKOPJE } from "../domain/parking";
import { groupParking } from "../domain/clusters";
import { accentColor } from "../domain/cosmetics";

export default function ParkingMap(props: ParkingMapProps) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null),
    draftLayer = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef(props);
  const userDot = useRef<L.CircleMarker | null>(null), accuracyCircle = useRef<L.Circle | null>(null);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);
  const [zoom, setZoom] = useState(15);
  const [viewRevision, setViewRevision] = useState(0);
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: "center",
      minZoom: 3,
    }).setView([SKOPJE.latitude, SKOPJE.longitude], 15);
    L.tileLayer(
      process.env.EXPO_PUBLIC_TILE_URL ??
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    ).addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    draftLayer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    instance.on("zoomend", () => setZoom(instance.getZoom()));
    instance.on("movestart", () =>
      callbacks.current.onSelectedPosition?.(null),
    );
    instance.on("moveend", () => {
      setViewRevision((value) => value + 1);
      const p = instance.getCenter();
      callbacks.current.onCenterChange?.({ latitude: p.lat, longitude: p.lng });
    });
    instance.on("dragstart", () => callbacks.current.onPan?.());
    instance.on("click", (event: L.LeafletMouseEvent) => {
      if (callbacks.current.picking)
        callbacks.current.onPick({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
      else callbacks.current.onBlankPress?.();
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      layers.current = null;
      draftLayer.current = null;
      userDot.current = null;
      accuracyCircle.current = null;
    };
  }, []);
  useEffect(() => {
    const group = layers.current,
      instance = map.current;
    if (!group || !instance) return;
    const select = (
      place: ParkingMapProps["places"][number],
      point = place.coordinate,
    ) => {
      if (props.picking) callbacks.current.onPick(point);
      else if (props.selectionEnabled !== false)
        callbacks.current.onSelect(place, point);
    };
    if (!props.drawing && props.showZones) {
      for (const place of props.places.filter((p) => p.kind === "zone")) {
        const selected = place.id === props.selectedId;
        if (place.geometry) {
          L.polygon(
            place.geometry.coordinates.map((ring) =>
              ring.map(([lon, lat]) => [lat, lon] as L.LatLngTuple),
            ),
            {
              color: selected ? "#962e2b" : "#527FBA",
              weight: selected ? 2.5 : 1,
              dashArray: "5 5",
              fillOpacity: selected ? 0.14 : 0.035,
            },
          )
            .on("click", (event: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(event);
              select(place, {
                latitude: event.latlng.lat,
                longitude: event.latlng.lng,
              });
            })
            .addTo(group);
        }
        if (zoom >= 17 || selected) {
          const label = document.createElement("span");
          label.textContent = place.zoneCode ?? place.name;
          L.marker([place.coordinate.latitude, place.coordinate.longitude], {
            icon: L.divIcon({
              className: "zone-label" + (!place.geometry ? " approximate" : ""),
              html: label,
              iconSize: [44, 24],
            }),
            title: place.name,
            zIndexOffset: selected ? 1100 : 0,
          })
            .on("click", () => select(place))
            .addTo(group);
        }
      }
    }
    const longitudeStep = zoom < 18 ? (120 * 360) / (256 * 2 ** zoom) : 0;
    const latitudeStep =
      longitudeStep * Math.cos((SKOPJE.latitude * Math.PI) / 180);
    const bounds = instance.getBounds().pad(0.15);
    const visible = props.places.filter((place) =>
      bounds.contains([place.coordinate.latitude, place.coordinate.longitude]),
    );
    if (!props.drawing) {
      for (const place of visible.filter((p) => p.kind !== "zone" && p.geometry && (zoom >= 17 || p.id === props.selectedId))) {
        const selected = place.id === props.selectedId;
        L.polygon(place.geometry!.coordinates.map((ring) => ring.map(([lon, lat]) => [lat, lon] as L.LatLngTuple)), {
          color: "#962E2B", weight: selected ? 2.5 : 1.5, fillOpacity: selected ? 0.12 : 0.045,
        }).on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          select(place, { latitude: event.latlng.lat, longitude: event.latlng.lng });
        }).addTo(group);
      }
    }
    for (const members of groupParking(
      props.drawing ? [] : visible,
      latitudeStep,
      longitudeStep,
      props.selectedId,
    )) {
      const place = members[0],
        selected = place.id === props.selectedId,
        cluster = members.length > 1;
      const availability = currentAvailability(place.availability);
      const color = cluster
        ? "#392c25"
        : availability.status === "spaces"
          ? "#087958"
          : availability.status === "full"
            ? "#B83A36"
            : place.access === "restricted"
              ? "#88948D"
              : "#392c25";
      const label = cluster ? String(members.length) : "P";
      const accent = cluster ? undefined : accentColor(place.contributionAccent);
      const icon = L.divIcon({
        className:
          "parking-pin" +
          (selected ? " selected" : "") +
          (cluster ? " cluster" : "") +
          (!cluster && availability.status === "spaces" ? " spaces" : ""),
        html:
          '<span style="background:' +
          color +
          (accent ? ";border-color:" + accent : "") +
          '">' +
          (!cluster && availability.status === "spaces" ? "P ✓" : label) +
          "</span>",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const title = cluster
        ? members.length +
          (props.language === "mk" ? " паркинг локации" : " parking places")
        : props.language === "en"
          ? (place.nameEn ?? place.name)
          : place.name;
      L.marker([place.coordinate.latitude, place.coordinate.longitude], {
        icon,
        title,
        zIndexOffset: selected
          ? 1000
          : availability.status === "spaces"
            ? 800
            : 0,
      })
        .on("click", () => {
          if (props.picking) callbacks.current.onPick(place.coordinate);
          else if (props.selectionEnabled === false) return;
          else if (cluster)
            instance.setView(
              [place.coordinate.latitude, place.coordinate.longitude],
              Math.min(19, zoom + 1),
              { animate: false },
            );
          else callbacks.current.onSelect(place);
        })
        .addTo(group);
    }
    const markerPoint =
      props.destinationMarker === undefined
        ? props.destination
        : props.destinationMarker;
    if (markerPoint && !props.drawing) {
      const title = document.createElement("span");
      title.textContent =
        props.destinationName ??
        (props.language === "mk" ? "Дестинација" : "Destination");
      L.marker([markerPoint.latitude, markerPoint.longitude], {
        icon: L.divIcon({
          className: "destination-pin",
          html: "<span></span>",
          iconSize: [34, 44],
          iconAnchor: [17, 44],
        }),
        title: title.textContent,
        zIndexOffset: 2000,
      })
        .bindTooltip(title, {
          permanent: true,
          direction: "top",
          offset: [0, -44],
          className: "destination-label",
        })
        .addTo(group);
    }
    userDot.current?.bringToFront();
    const anchor = props.selectedAnchor;
    if (props.selectedId && anchor) {
      const p = instance.latLngToContainerPoint([
        anchor.latitude,
        anchor.longitude,
      ]);
      callbacks.current.onSelectedPosition?.({ x: p.x, y: p.y });
    } else callbacks.current.onSelectedPosition?.(null);
    return () => {
      const old = group.getLayers();
      group.clearLayers();
      old.forEach((layer) => layer.off());
    };
  }, [
    props.places,
    props.selectedId,
    props.selectedAnchor,
    props.destination,
    props.destinationMarker,
    props.destinationName,
    props.drawing,
    props.showZones,
    props.picking,
    props.selectionEnabled,
    props.language,
    zoom,
    viewRevision,
  ]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!props.userLocation) {
      userDot.current?.remove(); userDot.current = null;
      accuracyCircle.current?.remove(); accuracyCircle.current = null;
      return;
    }
    const point: L.LatLngTuple = [props.userLocation.latitude, props.userLocation.longitude];
    if (userDot.current) userDot.current.setLatLng(point);
    else userDot.current = L.circleMarker(point, { radius: 7, fillColor: "#3977D5", color: "#fff", weight: 3, fillOpacity: 1, interactive: false }).addTo(instance);
    if (props.userAccuracy && props.userAccuracy > 0) {
      if (accuracyCircle.current) accuracyCircle.current.setLatLng(point).setRadius(props.userAccuracy);
      else accuracyCircle.current = L.circle(point, { radius: props.userAccuracy, color: "#3977D5", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(instance);
    } else { accuracyCircle.current?.remove(); accuracyCircle.current = null; }
    userDot.current.bringToFront();
  }, [props.userLocation, props.userAccuracy]);
  // Keep handles alive while GPS/catalog updates redraw the other overlays.
  useEffect(() => {
    const group = draftLayer.current;
    if (!group) return;
    const draft = (props.draftCoordinates ?? []).map(
      (p) => [p.latitude, p.longitude] as L.LatLngTuple,
    );
    const outline = L.polyline(draft, {
      color: "#962e2b",
      weight: 3,
      dashArray: "7 5",
      interactive: false,
    }).addTo(group);
    const polygon =
      draft.length > 2
        ? L.polygon(draft, {
            color: "#962e2b",
            weight: 1,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(group)
        : null;
    draft.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: Boolean(props.drawing),
        autoPan: true,
        zIndexOffset: 3000,
        title:
          (callbacks.current.language === "mk" ? "Агол " : "Corner ") +
          (index + 1),
        icon: L.divIcon({
          className: "zone-vertex",
          html: "<span></span>",
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
      }).addTo(group);
      marker.on("click", L.DomEvent.stopPropagation);
      marker.on("drag", () => {
        const p = marker.getLatLng();
        draft[index] = [p.lat, p.lng];
        outline.setLatLngs(draft);
        polygon?.setLatLngs(draft);
      });
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        callbacks.current.onMoveVertex?.(index, {
          latitude: p.lat,
          longitude: p.lng,
        });
      });
      marker.on("keydown", (event: L.LeafletKeyboardEvent) => {
        if (!callbacks.current.drawing) return;
        const offsets: Record<string, [number, number]> = {
          ArrowUp: [0, -3],
          ArrowDown: [0, 3],
          ArrowLeft: [-3, 0],
          ArrowRight: [3, 0],
        };
        const delta = offsets[event.originalEvent.key];
        if (!delta || !map.current) return;
        L.DomEvent.preventDefault(event.originalEvent);
        L.DomEvent.stopPropagation(event.originalEvent);
        const p = map.current.layerPointToLatLng(
          map.current.latLngToLayerPoint(marker.getLatLng()).add(delta),
        );
        callbacks.current.onMoveVertex?.(index, {
          latitude: p.lat,
          longitude: p.lng,
        });
      });
    });
    return () => {
      const old = group.getLayers();
      group.clearLayers();
      old.forEach((layer) => layer.off());
    };
  }, [props.draftCoordinates, props.drawing]);
  useEffect(() => {
    map.current?.setView(
      [props.destination.latitude, props.destination.longitude],
      15,
      { animate: false },
    );
  }, [
    props.destination.latitude,
    props.destination.longitude,
    props.cameraRevision,
  ]);
  return (
    <div
      ref={host}
      className={props.dark ? "parking-map-dark" : ""}
      aria-label={
        props.language === "mk"
          ? "Мапа на паркинзи во Скопје"
          : "Skopje parking map"
      }
      style={{
        width: "100%",
        height: "100%",
        cursor: props.picking ? "crosshair" : undefined,
      }}
    />
  );
}

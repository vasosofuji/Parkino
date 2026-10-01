import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ParkingMap from "../components/ParkingMap";
import MapCredit from "../components/MapCredit";
import MapDrawer from "../components/MapDrawer";
import LocationHelp from "../components/LocationHelp";
import ParkingPreview from "../components/ParkingPreview";
import SettingsSheet from "../components/SettingsSheet";
import { useTheme, type ThemeColors } from "../state/ThemeContext";
import { zoneGeometry, validZone, MAX_BOUNDARY_VERTICES } from "../domain/geometry";
import { containsParkingFix } from "../domain/arrival";
import { canAddAtLocation, nearbyOrigin } from "../domain/location";
import ParkingRow from "../components/ParkingRow";
import ParkingDetails from "../components/ParkingDetails";
import ProposalSheet from "../components/ProposalSheet";
import { Button, Icon, IconButton, Note, Sheet } from "../components/ui";
import {
  normalizeZoneCode,
  parkingPrice,
  rankParking,
  searchText,
  SKOPJE,
} from "../domain/parking";
import type {
  Coordinate,
  Destination,
  ParkingPlace,
  Geometry,
} from "../domain/types";
import { useParking } from "../state/ParkingContext";
import { useArrival } from "../hooks/useArrival";
import { api } from "../services/api";

type NewParking = {
  coordinate: Coordinate;
  geometry?: Geometry;
  accuracy?: number;
  zoneCode?: string;
};
export default function MapScreen() {
  const { colors, dark } = useTheme(),
    s = styles(colors);
  const { catalog, connected, language, t, refresh, now } = useParking();
  const gps = useArrival(catalog.places);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [center, setCenter] = useState<Coordinate>(SKOPJE);
  const [cameraRevision, setCameraRevision] = useState(0);
  const viewport = useRef<Coordinate>(SKOPJE),
    cameraMoved = useRef(false);
  const [draft, setDraft] = useState<Coordinate[]>([]);
  const [editingBoundary, setEditingBoundary] = useState<string | null>(null);
  const editingPerimeter = Boolean(editingBoundary && catalog.places.find((p) => p.id === editingBoundary)?.kind !== "zone");
  const [query, setQuery] = useState(""),
    [searching, setSearching] = useState(false);
  const [remote, setRemote] = useState<Destination[]>([]),
    searchVersion = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Coordinate | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false),
    [locationHelp, setLocationHelp] = useState(false);
  const [picking, setPicking] = useState<"destination" | "zone" | null>(null);
  const [proposal, setProposal] = useState<NewParking | null>(null);
  const [message, setMessage] = useState(""),
    [sending, setSending] = useState(false);
  const [locationDismissed, setLocationDismissed] = useState<string | null>(
      null,
    ),
    [locationRequest, setLocationRequest] = useState("");
  const [mapHeight, setMapHeight] = useState(700),
    [drawerHeight, setDrawerHeight] = useState(94);
  const [drawerRevision, setDrawerRevision] = useState(0);
  const [followupId, setFollowupId] = useState<string | null>(null);
  const target = nearbyOrigin(
    destination?.coordinate ?? null,
    gps.location,
    Math.max(now, Date.now()),
  );
  const rows = useMemo(
    () =>
      target ? rankParking(catalog.places, target, 60, 1500, "nearest") : [],
    [catalog.places, target],
  );
  const selectedPlace = catalog.places.find((place) => place.id === selected);
  const followupPlace = catalog.places.find((place) => place.id === followupId);
  const arrivalPlace = followupPlace ?? gps.arrival;
  const clearSelection = useCallback(() => {
    setSelected(null);
    setAnchor(null);
    setSelectedPoint(null);
  }, []);
  const select = useCallback((place: ParkingPlace, coordinate?: Coordinate) => {
    setSelected(place.id);
    setAnchor(coordinate ?? place.coordinate);
  }, []);
  const projectSelection = useCallback(
    (point: { x: number; y: number } | null) => {
      setSelectedPoint((previous) =>
        previous?.x === point?.x && previous?.y === point?.y ? previous : point,
      );
    },
    [],
  );
  const centerChanged = useCallback((point: Coordinate) => {
    viewport.current = point;
  }, []);
  const pan = useCallback(() => {
    cameraMoved.current = true;
  }, []);
  useEffect(() => {
    if (gps.initialLocation && !cameraMoved.current) {
      setCenter(gps.initialLocation);
      viewport.current = gps.initialLocation;
    }
  }, [gps.initialLocation]);

  const locationStatus =
    gps.status === "loading"
      ? t("Finding your location…", "Се бара вашата локација…")
      : gps.status === "ready"
        ? t("Location active", "Локацијата е активна") +
          " · ±" +
          Math.ceil(gps.accuracy ?? 0) +
          " m"
        : gps.status === "approximate"
          ? t("Location is approximate", "Локацијата е приближна") +
            " · ±" +
            Math.ceil(gps.accuracy ?? 0) +
            " m"
          : gps.status === "denied"
            ? t("Location access is off", "Пристапот до локација е исклучен")
            : gps.issue?.code === "services-off"
              ? t("Turn on Location / GPS", "Вклучете Локација / GPS")
              : t("Location needs attention", "Проверете ја локацијата");
  const locationWarning =
    (locationRequest &&
    (!canAddAtLocation(gps.location) || !inSkopje(gps.location!))
      ? locationRequest
      : "") || (gps.status !== "ready" ? locationStatus : "");
  const locationWarningKey =
    gps.status + ":" + (gps.issue?.code ?? "") + ":" + locationWarning;
  function retryLocation() {
    setLocationRequest("");
    setLocationDismissed(null);
    gps.retry();
  }
  function nearMe() {
    setLocationDismissed(null);
    setDestination(null);
    clearSearch();
    clearSelection();
    const point = nearbyOrigin(null, gps.location);
    if (point) {
      cameraMoved.current = true;
      setCameraRevision((value) => value + 1);
      setCenter({ latitude: point.latitude, longitude: point.longitude });
    } else {
      cameraMoved.current = false;
      retryLocation();
    }
  }
  function addParking() {
    clearSearch();
    clearSelection();
    setLocationDismissed(null);
    if (!canAddAtLocation(gps.location)) {
      setLocationRequest(
        gps.location
          ? t(
              "Wait for a precise location before adding parking.",
              "Почекајте прецизна локација за да додадете паркинг.",
            )
          : t(
              "Your location is unavailable. Enable GPS to add parking.",
              "Вашата локација е недостапна. Вклучете GPS за да додадете паркинг.",
            ),
      );
      if (gps.status !== "loading") gps.retry();
      return;
    }
    const point = gps.location!;
    if (!inSkopje(point)) {
      setLocationRequest(
        t(
          "Your location is outside Skopje.",
          "Вашата локација е надвор од Скопје.",
        ),
      );
      return;
    }
    const zone = catalog.places.find(
      (place) =>
        place.kind === "zone" &&
        place.geometry &&
        containsParkingFix(point, place),
    );
    setProposal({
      coordinate: { latitude: point.latitude, longitude: point.longitude },
      accuracy: point.accuracy!,
      zoneCode: zone?.zoneCode ?? undefined,
    });
  }
  function clearSearch() {
    searchVersion.current++;
    setQuery("");
    setRemote([]);
    setSearching(false);
  }
  function startDestination() {
    Keyboard.dismiss();
    clearSearch();
    clearSelection();
    cameraMoved.current = true;
    setMessage("");
    setPicking("destination");
  }
  function choose(value: Destination, move = true) {
    clearSearch();
    clearSelection();
    cameraMoved.current = true;
    setDestination(value);
    if (move) {
      setCameraRevision((value) => value + 1);
      setCenter(value.coordinate);
      viewport.current = value.coordinate;
    }
    setMessage("");
    Keyboard.dismiss();
  }
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const text = searchText(query.trim()),
      code = normalizeZoneCode(query);
    const local = [
      ...catalog.destinations,
      ...catalog.places
        .filter(
          (place) =>
            (place.zoneCode &&
              normalizeZoneCode(place.zoneCode).startsWith(code)) ||
            searchText(place.name + " " + (place.nameEn ?? "")).includes(text),
        )
        .map((place) => ({
          id: place.id,
          name:
            (place.zoneCode ? place.zoneCode + " · " : "") +
            (language === "en" ? (place.nameEn ?? place.name) : place.name),
          coordinate: place.coordinate,
        })),
    ].filter(
      (value) =>
        searchText(value.name).includes(text) ||
        normalizeZoneCode(value.name).startsWith(code),
    );
    return [...remote, ...local]
      .filter(
        (value, index, all) =>
          all.findIndex((other) => other.id === value.id) === index,
      )
      .slice(0, 5);
  }, [query, catalog, language, remote]);
  async function searchAddress() {
    if (query.trim().length < 3 || searching) return;
    const version = ++searchVersion.current;
    setSearching(true);
    setMessage("");
    try {
      const results = await api.search(query.trim());
      if (version !== searchVersion.current) return;
      setRemote(results);
      if (!results.length)
        setMessage(
          t(
            "No address found. Choose on the map.",
            "Нема резултати. Изберете на мапата.",
          ),
        );
    } catch {
      if (version === searchVersion.current)
        setMessage(
          t(
            "Search is unavailable. Choose on the map.",
            "Пребарувањето е недостапно. Изберете на мапата.",
          ),
        );
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }
  const moveVertex = useCallback((index: number, point: Coordinate) => {
    setDraft((points) =>
      points.map((previous, i) =>
        i === index
          ? {
              latitude: Math.max(41.91, Math.min(42.08, point.latitude)),
              longitude: Math.max(21.3, Math.min(21.58, point.longitude)),
            }
          : previous,
      ),
    );
  }, []);
  function cancelPicking() {
    setPicking(null);
    setDraft([]);
    setEditingBoundary(null);
    setMessage("");
    setDrawerHeight(94);
  }
  async function finishZone() {
    const shape = zoneGeometry(draft);
    if (!validZone(shape)) {
      setMessage(
        t(
          "Adjust the corners so edges don’t cross.",
          "Прилагодете ги аглите за да не се сечат линиите.",
        ),
      );
      return;
    }
    if (!editingBoundary) {
      setProposal({ geometry: shape, coordinate: draft[0] });
      setPicking(null);
      return;
    }
    setSending(true);
    try {
      await api.boundary(editingBoundary, shape);
      await refresh();
      cancelPicking();
      setMessage(editingPerimeter ? t("Parking perimeter saved", "Периметарот е зачуван") : t("Zone saved", "Зоната е зачувана"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t(
              "Could not save. Try again.",
              "Не е зачувано. Обидете се повторно.",
            ),
      );
    } finally {
      setSending(false);
    }
  }
  function dismissArrival() {
    gps.dismiss();
    setFollowupId(null);
  }
  function updateArrival() {
    if (arrivalPlace) setDetailsId(arrivalPlace.id);
    dismissArrival();
  }
  async function reportArrival(status: "spaces" | "full") {
    if (!gps.arrival) return;
    const place = gps.arrival;
    setSending(true);
    setMessage("");
    try {
      await api.report(place.id, status);
      await refresh();
      gps.dismiss();
      if (!parkingPrice(place)) setFollowupId(place.id);
    } catch {
      setMessage(
        t("Could not send. Try again.", "Не е испратено. Обидете се повторно."),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <View
        style={s.map}
        onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
      >
        <ParkingMap
          cameraRevision={cameraRevision}
          places={catalog.places}
          selectedId={selected}
          selectedAnchor={anchor}
          onSelectedPosition={projectSelection}
          onCenterChange={centerChanged}
          onBlankPress={clearSelection}
          selectionEnabled={!picking}
          destination={center}
          destinationMarker={
            picking === "destination" ? null : (destination?.coordinate ?? null)
          }
          userLocation={gps.location}
          userAccuracy={gps.accuracy}
          destinationName={destination?.name}
          drawing={picking === "zone"}
          onMoveVertex={moveVertex}
          onPan={pan}
          picking={picking === "zone"}
          showZones
          dark={dark}
          draftCoordinates={draft}
          onSelect={select}
          onPick={(point) => {
            if (picking !== "zone") return;
            if (!inSkopje(point)) {
              setMessage(
                t("Choose an area in Skopje.", "Изберете област во Скопје."),
              );
              return;
            }
            setDraft((points) =>
              points.length < MAX_BOUNDARY_VERTICES ? [...points, point] : points,
            );
          }}
          language={language}
        />
        {!picking ? (
          <>
            <View style={s.searchPanel}>
              <View style={s.searchBox}>
                <Icon name="search" />
                <TextInput
                  style={s.input}
                  value={query}
                  placeholder={
                    destination?.name ??
                    t("Where are you going?", "Каде одите?")
                  }
                  accessibilityLabel={t(
                    "Search destination or zone",
                    "Пребарај дестинација или зона",
                  )}
                  placeholderTextColor={colors.muted}
                  returnKeyType="search"
                  onSubmitEditing={() => void searchAddress()}
                  onChangeText={(value) => {
                    clearSearch();
                    setQuery(value);
                    setMessage("");
                  }}
                />
                {query || destination ? (
                  <IconButton
                    name="x"
                    label={t("Clear destination", "Избриши дестинација")}
                    onPress={() => {
                      clearSearch();
                      setDestination(null);
                    }}
                  />
                ) : null}
                <IconButton
                  name="more-horizontal"
                  label={t("Settings", "Поставки")}
                  onPress={() => setMenu(true)}
                />
              </View>
              {locationWarning && locationDismissed !== locationWarningKey ? (
                <View style={s.locationNotice}>
                  <Pressable
                    style={s.flex}
                    accessibilityRole="button"
                    onPress={() => setLocationHelp(true)}
                  >
                    <Text
                      accessibilityLiveRegion="polite"
                      style={s.locationText}
                    >
                      {locationWarning}
                    </Text>
                  </Pressable>
                  <IconButton
                    name="x"
                    label={t(
                      "Dismiss location notification",
                      "Затвори известување за локација",
                    )}
                    onPress={() => setLocationDismissed(locationWarningKey)}
                  />
                </View>
              ) : null}
              {query.trim() ? (
                <View style={s.suggestions}>
                  {suggestions.map((value) => (
                    <Pressable
                      accessibilityRole="button"
                      key={value.id}
                      onPress={() => choose(value)}
                      style={s.suggestion}
                    >
                      <Icon name="map-pin" size={16} />
                      <Text numberOfLines={2} style={s.suggestionName}>
                        {value.name}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void searchAddress()}
                    style={s.suggestion}
                    disabled={searching || query.trim().length < 3}
                  >
                    {searching ? (
                      <ActivityIndicator color={colors.green} />
                    ) : (
                      <Icon name="search" size={16} />
                    )}
                    <Text style={s.suggestionName}>
                      {t("Search this address", "Пребарај ја адресата")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={startDestination}
                    style={s.suggestion}
                  >
                    <Icon name="crosshair" size={16} />
                    <Text style={s.suggestionName}>
                      {t("Choose on map", "Избери на мапа")}
                    </Text>
                  </Pressable>
                  {remote.length ? (
                    <Note>© OpenStreetMap contributors</Note>
                  ) : null}
                </View>
              ) : null}
              {message ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Dismiss message", "Затвори порака")}
                  onPress={() => setMessage("")}
                  style={s.notice}
                >
                  <Text accessibilityLiveRegion="polite" style={s.noticeText}>
                    {message}
                  </Text>
                  <Icon name="x" size={16} />
                </Pressable>
              ) : null}
            </View>
            {selectedPlace && selectedPoint && !query ? (
              <ParkingPreview
                key={selectedPlace.id}
                place={selectedPlace}
                point={selectedPoint}
                mapHeight={mapHeight}
                onClose={clearSelection}
                onUpdate={() => setDetailsId(selectedPlace.id)}
              />
            ) : null}
            {drawerHeight <= 100 ? <View style={[s.locate, { bottom: drawerHeight + 14 }]}>
              <IconButton
                name="crosshair"
                label={t("Parking near me", "Паркинг во близина")}
                onPress={nearMe}
              />
            </View> : null}
            <MapDrawer
              key={drawerRevision}
              onHeightChange={setDrawerHeight}
              onDestination={startDestination}
              onAdd={addParking}
              onDraw={() => {
                Keyboard.dismiss();
                clearSearch();
                clearSelection();
                cameraMoved.current = true;
                setDraft([]);
                setEditingBoundary(null);
                setMessage("");
                setPicking("zone");
              }}
            >
              {target ? (
                <>
                  <Text style={s.caption}>
                    {destination
                      ? t(
                          "Parking near destination",
                          "Паркинг до дестинацијата",
                        )
                      : t("Parking near you", "Паркинг во близина")}
                  </Text>
                  {rows.slice(0, 3).map((row) => (
                    <ParkingRow
                      key={row.place.id}
                      place={row.place}
                      distance={row.distance}
                      cost={row.cost}
                      selected={selected === row.place.id}
                      onPress={(place) => {
                        select(place);
                        setDrawerHeight(94);
                        setDrawerRevision((value) => value + 1);
                      }}
                    />
                  ))}
                  {!rows.length ? (
                    <Note>
                      {t(
                        "No parking mapped nearby",
                        "Нема означен паркинг во близина",
                      )}
                    </Note>
                  ) : null}
                </>
              ) : (
                <Button
                  title={t(
                    "Enable location for nearby parking",
                    "Вклучи локација за блиски паркинзи",
                  )}
                  variant="secondary"
                  onPress={() => {
                    setLocationDismissed(null);
                    setLocationHelp(true);
                  }}
                />
              )}
              {!connected ? (
                <Note>
                  {t("Offline · saved map", "Без врска · зачувана мапа")}
                </Note>
              ) : null}
            </MapDrawer>
          </>
        ) : (
          <>
            <View style={s.pickTop}>
              <Button
                title={t("Cancel", "Откажи")}
                icon="x"
                variant="secondary"
                disabled={sending}
                onPress={cancelPicking}
              />
              {picking === "zone" ? (
                <Text style={s.pickHint}>
                  {editingPerimeter ? t("Perimeter · Tap or drag corners", "Периметар · Повлечете за промена") : t(
                    "Tap to add · Drag corners to adjust",
                    "Допрете за додавање · Повлечете за промена",
                  )}
                </Text>
              ) : null}
            </View>
            {picking === "destination" ? (
              <>
                <View pointerEvents="none" style={s.centerPin}>
                  <View style={s.pinHead}>
                    <View style={s.pinHole} />
                  </View>
                  <View style={s.pinTip} />
                </View>
                <View style={s.drawActions}>
                  <Button
                    style={s.flex}
                    title={t("Set destination", "Постави дестинација")}
                    icon="map-pin"
                    onPress={() => {
                      const point = viewport.current;
                      if (!inSkopje(point)) {
                        setMessage(
                          t(
                            "Choose a destination in Skopje.",
                            "Изберете дестинација во Скопје.",
                          ),
                        );
                        return;
                      }
                      choose(
                        {
                          id: "picked",
                          name: t("Destination", "Дестинација"),
                          coordinate: { ...point },
                        },
                        false,
                      );
                      setPicking(null);
                      setDrawerHeight(94);
                    }}
                  />
                </View>
              </>
            ) : (
              <View style={s.drawActions}>
                <Button
                  title={t("Undo", "Врати")}
                  variant="secondary"
                  disabled={!draft.length || sending}
                  onPress={() => setDraft((points) => points.slice(0, -1))}
                />
                <Button
                  style={s.flex}
                  title={
                    sending
                      ? t("Saving…", "Се зачувува…")
                      : editingBoundary
                        ? editingPerimeter ? t("Save perimeter", "Зачувај периметар") : t("Save zone", "Зачувај зона")
                        : t("Finish zone", "Заврши зона")
                  }
                  disabled={draft.length < 3 || sending}
                  onPress={() => void finishZone()}
                />
              </View>
            )}
            {message ? (
              <View style={s.pickMessage}>
                <Text style={s.locationText}>{message}</Text>
              </View>
            ) : null}
          </>
        )}
        <MapCredit />
      </View>
      <ParkingDetails
        key={detailsId ?? "none"}
        place={catalog.places.find((place) => place.id === detailsId)}
        visible={detailsId !== null}
        initialEditing
        minutes={60}
        onClose={() => setDetailsId(null)}
        onEditBoundary={(place) => {
          setDetailsId(null);
          clearSelection();
          setEditingBoundary(place.id);
          clearSearch();
          setMessage("");
          setDraft(
            place.geometry?.coordinates[0]
              .slice(0, -1)
              .map(([longitude, latitude]) => ({ latitude, longitude })) ?? [],
          );
          cameraMoved.current = true;
          setPicking("zone");
        }}
      />
      <LocationHelp
        visible={locationHelp}
        issue={gps.issue}
        onClose={() => setLocationHelp(false)}
        onRetry={retryLocation}
      />
      {proposal ? (
        <ProposalSheet
          coordinate={proposal.coordinate}
          geometry={proposal.geometry}
          locationAccuracy={proposal.accuracy}
          initial={{
            name: proposal.geometry ? undefined : t("Parking", "Паркинг"),
            zoneCode: proposal.zoneCode,
          }}
          onClose={() => {
            setProposal(null);
            setDraft([]);
            setDrawerHeight(94);
          }}
          onSubmitted={(id) => {
            setSelected(id);
            setAnchor(proposal.coordinate);
            setMessage(t("Added to the map", "Додадено на мапата"));
          }}
        />
      ) : null}
      <SettingsSheet
        visible={menu}
        onClose={() => setMenu(false)}
        locationStatus={locationStatus}
        onRefreshLocation={() => {
          setMenu(false);
          retryLocation();
        }}
        onPermissions={() => {
          setMenu(false);
          setLocationHelp(true);
        }}
      />
      <Sheet
        visible={
          Boolean(arrivalPlace) &&
          !selected &&
          !detailsId &&
          !menu &&
          !proposal &&
          !picking &&
          !locationHelp
        }
        title={
          followupPlace || arrivalPlace?.kind === "zone"
            ? t("Add parking information", "Додај информации за паркингот")
            : t("Any free spaces here?", "Има ли слободни места тука?")
        }
        onClose={dismissArrival}
      >
        <Text style={s.title}>
          {language === "en"
            ? (arrivalPlace?.nameEn ?? arrivalPlace?.name)
            : arrivalPlace?.name}
        </Text>
        {!followupPlace && arrivalPlace?.kind !== "zone" ? (
          <View style={s.answers}>
            <Button
              style={s.flex}
              title={t("Spaces available", "Има места")}
              disabled={sending || !connected}
              onPress={() => void reportArrival("spaces")}
            />
            <Button
              style={s.flex}
              title={t("Full", "Полн")}
              variant="secondary"
              disabled={sending || !connected}
              onPress={() => void reportArrival("full")}
            />
          </View>
        ) : null}
        {arrivalPlace &&
        (!parkingPrice(arrivalPlace) ||
          arrivalPlace.kind === "zone" ||
          followupPlace) ? (
          <>
            <Note>
              {t(
                "Add a sign photo or the parking price.",
                "Додајте слика од таблата или цена за паркирање.",
              )}
            </Note>
            <Button
              title={t("Add photo or price", "Додај слика или цена")}
              variant="secondary"
              onPress={updateArrival}
            />
          </>
        ) : null}
        {!connected ? (
          <Note>
            {t("Connect to send your answer.", "Поврзете се за да одговорите.")}
          </Note>
        ) : null}
        {message ? <Note>{message}</Note> : null}
      </Sheet>
    </SafeAreaView>
  );
}
function inSkopje(point: Coordinate) {
  return (
    point.latitude >= 41.91 &&
    point.latitude <= 42.08 &&
    point.longitude >= 21.3 &&
    point.longitude <= 21.58
  );
}
const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.paper },
    map: { flex: 1, overflow: "hidden" },
    searchPanel: {
      position: "absolute",
      zIndex: 1080,
      top: 12,
      left: 12,
      right: 12,
      maxWidth: 560,
      gap: 6,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.paper,
      borderRadius: 18,
      paddingLeft: 16,
      paddingRight: 6,
      minHeight: 58,
      gap: 10,
      elevation: 4,
      boxShadow: "0 3px 14px #153d3a20",
    },
    input: {
      flex: 1,
      minWidth: 0,
      fontSize: 16,
      color: colors.ink,
      paddingVertical: 14,
    },
    suggestions: {
      backgroundColor: colors.paper,
      borderRadius: 16,
      padding: 8,
      elevation: 5,
    },
    suggestion: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      minHeight: 44,
    },
    suggestionName: { flex: 1, color: colors.ink, fontSize: 14 },
    notice: {
      backgroundColor: colors.paper,
      borderRadius: 12,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    noticeText: { color: colors.ink, flex: 1, lineHeight: 20 },
    locationNotice: {
      backgroundColor: colors.paper,
      borderRadius: 12,
      paddingLeft: 12,
      paddingRight: 4,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    locationText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.red,
      fontWeight: "600",
    },
    locate: { position: "absolute", zIndex: 1000, left: 14 },
    pickTop: {
      position: "absolute",
      top: 12,
      left: 12,
      right: 12,
      zIndex: 1200,
      alignItems: "flex-start",
      gap: 8,
    },
    pickHint: {
      backgroundColor: colors.paper,
      color: colors.ink,
      borderRadius: 10,
      padding: 10,
      fontSize: 13,
    },
    drawActions: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 24,
      zIndex: 1200,
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.paper,
      padding: 10,
      borderRadius: 18,
      maxWidth: 540,
    },
    pickMessage: {
      position: "absolute",
      left: 12,
      right: 12,
      top: 80,
      zIndex: 1200,
      padding: 12,
      backgroundColor: colors.paper,
      borderRadius: 12,
    },
    centerPin: {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: 38,
      height: 50,
      marginLeft: -19,
      marginTop: -50,
      alignItems: "center",
      zIndex: 1000,
    },
    pinHead: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "#D63F37",
      borderColor: "#FFFFFF",
      borderWidth: 3,
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 3px 8px #00000045",
    },
    pinHole: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
    },
    pinTip: {
      marginTop: -4,
      width: 0,
      height: 0,
      borderLeftWidth: 9,
      borderRightWidth: 9,
      borderTopWidth: 16,
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
      borderTopColor: "#D63F37",
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.ink },
    caption: { fontSize: 13, color: colors.muted, marginTop: 4 },
    answers: { flexDirection: "row", gap: 10 },
    flex: { flex: 1 },
  });

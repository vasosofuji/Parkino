type Vector = { remove: () => void; show: () => void; onReady: (callback: () => void) => void; onError: (callback: (fatal?: boolean) => void) => void };
type Adapter = { addRaster: () => { remove: () => void }; addVector: () => Vector; supported: () => boolean };

/** Let Leaflet finish unregistering a layer even when GL never initialized or already lost its context. */
export function guardVectorLayerRemoval<Map>(layer: {
  onRemove: (map: Map) => unknown;
  getMaplibreMap: () => { remove: () => void } | undefined;
  getContainer: () => { remove: () => void } | undefined;
}) {
  const original = layer.onRemove;
  layer.onRemove = function (map) {
    try { original.call(this, map); }
    catch {
      try { this.getMaplibreMap()?.remove(); } catch { /* Failed contexts can throw during disposal. */ }
      try { this.getContainer()?.remove(); } catch { /* An already detached container needs no cleanup. */ }
    }
  };
}

/** A raster stays beneath the vector until it is ready; errors never leave an empty map. */
export function installBasemap(adapter: Adapter, forceRaster = false, timeoutMs = 15000) {
  let raster = adapter.addRaster();
  let vector: Vector | undefined, disposed = false, failed = false, ready = false, errors = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lifecycle = { fallback() {
    if (disposed || failed) return;
    failed = true;
    if (timer) clearTimeout(timer);
    if (ready) raster = adapter.addRaster();
    try { vector?.remove(); } catch { /* Keep the raster even if a failed GL context cannot dispose normally. */ } vector = undefined;
  } };
  if (!forceRaster) {
    try {
      if (adapter.supported()) {
        vector = adapter.addVector();
        timer = setTimeout(lifecycle.fallback, timeoutMs);
        vector.onReady(() => {
          if (disposed || failed) return;
          ready = true; errors = 0;
          if (timer) clearTimeout(timer);
          vector?.show(); raster.remove();
        });
        vector.onError(fatal => { if (fatal || ++errors >= 3) lifecycle.fallback(); });
      }
    } catch { lifecycle.fallback(); }
  }
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    try { vector?.remove(); } catch { /* A destroyed WebGL context may already have removed itself. */ }
    raster.remove();
  };
}

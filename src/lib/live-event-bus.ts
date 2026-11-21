// In-page bus: LiveScreenRecorder yayinlar, alternatif transport'lar
// (ornegin WebRTC DataChannel streamer) ayni event'leri relay'den
// bagimsiz olarak tukitebilir.

export type LiveBusKind = "meta" | "action" | "screen";

type Listener = (kind: LiveBusKind, data: any) => void;

const listeners = new Set<Listener>();
let snapshotProvider: (() => void | Promise<void>) | null = null;

export const liveBus = {
  emit(kind: LiveBusKind, data: any) {
    listeners.forEach((fn) => {
      try {
        fn(kind, data);
      } catch {
        /* ignore */
      }
    });
  },
  onEvent(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  registerSnapshotProvider(fn: () => void | Promise<void>) {
    snapshotProvider = fn;
  },
  requestSnapshot() {
    if (snapshotProvider) {
      try {
        void snapshotProvider();
      } catch {
        /* ignore */
      }
    }
  },
};

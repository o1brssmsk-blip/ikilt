import type { RealtimeChannel } from "@supabase/supabase-js";

const CHUNK_SIZE = 60000; // 60KB safe frame limit (Supabase WebSocket supports up to 256KB)
const SEND_BATCH = 8; // Paralel chunk gonderim pencere boyutu (rate-limit korumasi)

export type ChunkedPayload = {
  chunked: true;
  transferId: string;
  index: number;
  total: number;
  chunk: string;
};

export type GzChunkedPayload = {
  gz: true;
  transferId: string;
  index: number;
  total: number;
  chunk: string;
};

export type RawPayload<T = any> = {
  raw: true;
  data: T;
};

export async function deflateToBase64(input: string): Promise<string> {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Blob([input]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function inflateFromBase64(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

export async function sendBroadcastPacket<T = any>(
  channel: RealtimeChannel,
  eventName: string,
  data: T,
): Promise<void> {
  try {
    const jsonStr = JSON.stringify(data);
    if (jsonStr.length <= CHUNK_SIZE) {
      await channel.send({
        type: "broadcast",
        event: eventName,
        payload: { raw: true, data } satisfies RawPayload<T>,
      });
      return;
    }

    // Buyuk paketler (full snapshot vs.): deflate sikistir -> base64 ->
    // ~5-8x kuculur, parcalara bol ve PARALEL gonder (sira ile bekletmez).
    const transferId = Math.random().toString(36).slice(2, 9);
    let compressed: string | null = null;
    try {
      compressed = await deflateToBase64(jsonStr);
    } catch {
      compressed = null;
    }

    const body = compressed ?? jsonStr;
    const useGz = compressed !== null;
    const total = Math.ceil(body.length / CHUNK_SIZE);

    for (let batchStart = 0; batchStart < total; batchStart += SEND_BATCH) {
      const batch: Promise<unknown>[] = [];
      for (let i = batchStart; i < Math.min(batchStart + SEND_BATCH, total); i++) {
        const chunk = body.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const payload = useGz
          ? ({ gz: true, transferId, index: i, total, chunk } satisfies GzChunkedPayload)
          : ({ chunked: true, transferId, index: i, total, chunk } satisfies ChunkedPayload);
        batch.push(
          channel.send({
            type: "broadcast",
            event: eventName,
            payload,
          }),
        );
      }
      await Promise.allSettled(batch);
    }
  } catch (err) {
    console.error("[sendBroadcastPacket] error:", err);
  }
}

type TransferEntry = {
  gz: boolean;
  total: number;
  parts: string[];
  received: number;
  timer: ReturnType<typeof setTimeout>;
};

export class BroadcastReassembler {
  private transfers = new Map<string, TransferEntry>();

  receive<T = any>(payload: any, onComplete: (data: T) => void): void {
    if (!payload) return;

    if (payload.raw) {
      onComplete(payload.data as T);
      return;
    }

    const isGz = payload.gz === true;
    const isChunked = payload.chunked === true;
    if (!isGz && !isChunked) return;

    const { transferId, index, total, chunk } = payload as ChunkedPayload | GzChunkedPayload;
    let entry = this.transfers.get(transferId);

    if (!entry) {
      const timer = setTimeout(() => {
        this.transfers.delete(transferId);
      }, 15000);

      entry = { gz: isGz, total, parts: new Array(total), received: 0, timer };
      this.transfers.set(transferId, entry);
    }

    if (!entry.parts[index]) {
      entry.parts[index] = chunk;
      entry.received++;
    }

    if (entry.received === entry.total) {
      clearTimeout(entry.timer);
      this.transfers.delete(transferId);
      const fullStr = entry.parts.join("");
      if (entry.gz) {
        void inflateFromBase64(fullStr)
          .then((text) => onComplete(JSON.parse(text) as T))
          .catch((e) => console.error("[BroadcastReassembler] gz inflate error:", e));
      } else {
        try {
          onComplete(JSON.parse(fullStr) as T);
        } catch (e) {
          console.error("[BroadcastReassembler] parse error:", e);
        }
      }
    }
  }

  clear(): void {
    for (const entry of this.transfers.values()) {
      clearTimeout(entry.timer);
    }
    this.transfers.clear();
  }
}

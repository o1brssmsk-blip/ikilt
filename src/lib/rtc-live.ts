import { deflateToBase64, type ChunkedPayload, type GzChunkedPayload, type RawPayload } from "@/lib/broadcast-transfer";

// Supabase kanali sadece SDP/ICE signaling icin; veri WebRTC DataChannel'dan gider.
export const RTC_SIGNAL = {
  OFFER: "rtc_offer",
  ANSWER: "rtc_answer",
  ICE: "rtc_ice",
  CLOSE: "rtc_close",
  READY: "rtc_ready",
} as const;

export const RTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const DC_CHUNK = 48000; // 48KB — SCTP mesaj limitinden guvenli pay
const DC_MAX_BUFFERED = 12 * 1024 * 1024; // 12MB backlog'da paket at (tikanmayi onler)

export type DcEnvelope = {
  event: "client_meta" | "user_action" | "screen_event";
  payload: RawPayload | ChunkedPayload | GzChunkedPayload;
};

// Tek bir DataChannel mesaji = bir payload objesi (raw ya da tek chunk).
// Reassembler tarafi broadcast protokoluyle birebir ayni kaliyor.
export async function sendDataChannelPacket(
  dc: RTCDataChannel,
  event: DcEnvelope["event"],
  data: any,
): Promise<void> {
  if (dc.readyState !== "open") return;

  const jsonStr = JSON.stringify(data);
  const send = (payload: RawPayload | ChunkedPayload | GzChunkedPayload) => {
    if (dc.bufferedAmount > DC_MAX_BUFFERED) return; // backlog varsa atla
    try {
      dc.send(JSON.stringify({ event, payload } satisfies DcEnvelope));
    } catch {
      /* ignore */
    }
  };

  if (jsonStr.length <= DC_CHUNK) {
    send({ raw: true, data });
    return;
  }

  const transferId = Math.random().toString(36).slice(2, 9);
  let body = jsonStr;
  let useGz = false;
  try {
    body = await deflateToBase64(jsonStr);
    useGz = true;
  } catch {
    useGz = false;
  }

  const total = Math.ceil(body.length / DC_CHUNK);
  for (let i = 0; i < total; i++) {
    const chunk = body.slice(i * DC_CHUNK, (i + 1) * DC_CHUNK);
    send(
      useGz
        ? { gz: true, transferId, index: i, total, chunk }
        : { chunked: true, transferId, index: i, total, chunk },
    );
  }
}

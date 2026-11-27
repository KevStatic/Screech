import { parseCheckinText } from '@screech/core';
import type { CheckinFields, DecodedPacket, Result } from '@screech/core';

/** Routes a decoded packet to the séance join flow. */
export type CheckinRoute =
  /** Not a check-in packet, or its text did not parse: use screenState. */
  | { readonly kind: 'none' }
  | { readonly kind: 'checkin'; readonly fields: CheckinFields };

const NONE: CheckinRoute = { kind: 'none' };

/** Never throws. Multipart and unparseable check-ins stay on the existing path. */
export function checkinRoute(result: Result<DecodedPacket>): CheckinRoute {
  try {
    const r: unknown = result;
    if (typeof r !== 'object' || r === null) return NONE;
    const candidate = r as { ok?: unknown; value?: unknown };
    if (candidate.ok !== true) return NONE;
    const value = candidate.value;
    if (typeof value !== 'object' || value === null) return NONE;
    const packet = value as { multipart?: unknown; type?: unknown; payload?: unknown };
    if (packet.multipart !== false || packet.type !== 'checkin') return NONE;
    const payload = packet.payload as { text?: unknown } | null;
    if (typeof payload !== 'object' || payload === null) return NONE;
    const parsed = parseCheckinText(payload.text);
    return parsed.ok ? { kind: 'checkin', fields: parsed.value } : NONE;
  } catch {
    return NONE;
  }
}

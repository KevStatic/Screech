const MIN_VOLUME = 1;
const MAX_VOLUME = 100;

/** Validates a transmit volume: an integer in 1..100. Throws RangeError otherwise. */
export function defineTransmitVolume(value: number): number {
  if (!Number.isInteger(value) || value < MIN_VOLUME || value > MAX_VOLUME) {
    throw new RangeError(`Transmit volume ${value} is outside ${MIN_VOLUME}..${MAX_VOLUME}`);
  }
  return value;
}

/** The single transmit volume definition, passed to every encode(). */
export const TRANSMIT_VOLUME: number = defineTransmitVolume(50);

/** Analyser FFT size for the mic input. */
export const FFT_SIZE = 2048;

declare module 'ggwave' {
  export interface GGWaveParameters {
    sampleRateInp: number;
    sampleRateOut: number;
    sampleFormatInp: number;
    sampleFormatOut: number;
    [key: string]: number;
  }

  export interface GGWaveModule {
    getDefaultParameters(): GGWaveParameters;
    init(parameters: GGWaveParameters): number;
    encode(
      instance: number,
      payload: string | Uint8Array,
      protocolId: number,
      volume: number,
    ): Int8Array;
    decode(instance: number, samples: Int8Array): Int8Array;
    ProtocolId: { GGWAVE_PROTOCOL_AUDIBLE_FAST: number; GGWAVE_PROTOCOL_AUDIBLE_NORMAL: number; [key: string]: number };
    SampleFormat: { GGWAVE_SAMPLE_FORMAT_F32: number; [key: string]: number };
  }

  const factory: () => Promise<GGWaveModule>;
  export default factory;
}

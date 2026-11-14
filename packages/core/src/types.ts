export type PacketType = 'text' | 'url' | 'wifi' | 'contact' | 'checkin' | 'hunt-clue';

export type WifiSecurity = 'open' | 'wpa' | 'wep';

export type Payload =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'url'; readonly url: string }
  | {
      readonly type: 'wifi';
      readonly ssid: string;
      readonly password: string;
      readonly security: WifiSecurity;
    }
  | { readonly type: 'contact'; readonly text: string }
  | { readonly type: 'checkin'; readonly text: string }
  | { readonly type: 'hunt-clue'; readonly text: string };

export interface PacketFlags {
  readonly sealed: boolean;
  readonly compressed: boolean;
  readonly multipart: boolean;
}

/** Result of decoding or opening a packet. */
export type DecodedPacket =
  | {
      readonly multipart: false;
      readonly type: PacketType;
      readonly flags: PacketFlags;
      readonly payload: Payload;
    }
  | {
      /**
       * Multipart packets are not interpreted. `body` is a copy of the Body bytes
       * (after decryption for a Sealed_Packet).
       */
      readonly multipart: true;
      readonly type: PacketType;
      readonly flags: PacketFlags;
      readonly body: Uint8Array;
    };

export interface SenderState {
  /** Exactly 4 bytes. */
  readonly senderId: Uint8Array;
  /** Integer 0..65535. */
  readonly counter: number;
}

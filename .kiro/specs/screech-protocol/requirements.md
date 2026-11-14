# Requirements Document

## Introduction

The Screech protocol is the packet codec for Screech, which sends small payloads between devices as sound using ggwave. The codec lives in `packages/core` as functions over `Uint8Array`. It turns a typed payload (text, URL, Wi-Fi credentials, contact, check-in code, hunt clue) into a Packet_V1 byte sequence of at most 140 bytes, and turns received bytes back into a typed payload. Optionally it seals a packet with AES-GCM using a caller-supplied 128-bit room key.

Packet_V1 has two layouts:

- Unsealed: Header, Type, Flags, Body.
- Sealed: Header, Type, Flags, Sender_ID (4 bytes), Counter (2 bytes), Body, Tag (8 bytes). The sealed overhead is 17 bytes (3 + 4 + 2 + 8), so the sealed Body has at most 123 bytes and the unsealed Body has at most 137 bytes.

Unsealed encode and decode are synchronous functions that return a result directly. Sealing and opening are asynchronous because Web Crypto is asynchronous, and they return Promises that resolve to a result or a Codec_Error. Encoding and sealing are deterministic given the caller-supplied Sender_ID and Counter. The only random generation is in the Rotation_Helper, which creates a fresh Sender_ID when the Counter would wrap.

All packet bytes are handled as `Uint8Array`, never as strings, because ggwave converts strings to UTF-8 and would corrupt binary data.

The Codec enforces only the hard 140-byte Size_Cap.

Out of scope: key exchange, multipart reassembly, audio transmission through ggwave, and the UI.

## Glossary

- **Codec**: The set of functions in `packages/core` that encode payloads into packets and decode packets into payloads.
- **Encoder**: The synchronous part of the Codec that converts a Payload into an unsealed Packet.
- **Decoder**: The synchronous part of the Codec that converts an unsealed Packet into a Payload.
- **Sealer**: The asynchronous part of the Codec that converts a Payload into a Sealed_Packet.
- **Opener**: The asynchronous part of the Codec that converts a Sealed_Packet into a Payload.
- **Rotation_Helper**: The synchronous Codec function that takes a Sender_State and returns the next Sender_State.
- **Sender_State**: A pair of a Sender_ID and a Counter that the caller keeps for one sending device.
- **Packet**: A `Uint8Array` in the Packet_V1 format.
- **Packet_V1**: The wire format. Unsealed: Header, Type, Flags, Body. Sealed: Header, Type, Flags, Sender_ID, Counter, Body, Tag.
- **Header**: The first byte of a Packet. Its high nibble is the Magic_Nibble and its low nibble is the Version_Nibble.
- **Magic_Nibble**: The fixed 4-bit value that identifies a Screech packet. The design phase will choose its value.
- **Version_Nibble**: The 4-bit protocol version. The value 1 identifies Packet_V1.
- **Type**: The second byte of a Packet. Valid values are text, url, wifi, contact, checkin and hunt-clue.
- **Flags**: The third byte of a Packet. Bit assignments are sealed, compressed and multipart. All other bits are reserved.
- **Body**: The bytes of the Packet that carry the Payload in its type-specific encoding. In a Sealed_Packet the Body is encrypted.
- **Payload**: The typed, uncompressed data a caller wants to send, for example a URL string or a Wi-Fi credential record.
- **Sender_ID**: A 4-byte random identifier that a sending device generates once per session. It is placed before the Counter in a Sealed_Packet.
- **Counter**: A 2-byte unsigned big-endian message counter placed after the Sender_ID in a Sealed_Packet.
- **Nonce**: The 12-byte AES-GCM initialization vector. It is the Sender_ID (4 bytes), followed by the Counter (2 bytes), followed by 6 zero bytes.
- **Tag**: The 8-byte truncated AES-GCM authentication tag placed after the Body in a Sealed_Packet.
- **Room_Key**: A 128-bit AES key (16 bytes) supplied by the caller.
- **Sealed_Packet**: A Packet whose sealed flag is set.
- **Sealed_Overhead**: The 17 bytes that a Sealed_Packet adds to its Body: Header, Type and Flags (3), Sender_ID (4), Counter (2) and Tag (8).
- **Size_Cap**: The maximum Packet length of 140 bytes.
- **Codec_Error**: A typed error value (an Err result) returned by the Codec in place of a Payload, Packet or Sender_State. It carries a machine-readable code. The defined codes are `bad-magic`, `unsupported-version`, `truncated`, `unknown-type`, `reserved-flags`, `too-large`, `invalid-payload`, `invalid-wifi`, `invalid-body`, `auth-failed`, `key-required`, `invalid-key`, `invalid-counter`, `invalid-sender-id`, `not-sealed` and `crypto-unavailable`. There are 16 codes.
- **Prefix_Table**: A fixed table that maps common domain prefixes to one-byte codes for URL compression.
- **Wi-Fi_Credentials**: An SSID, a password and a security type.

## Requirements

### Requirement 1: Packet header

**User Story:** As a receiving device, I want every Packet to start with a recognizable header, so that I can ignore sound that is not a Screech packet.

#### Acceptance Criteria

1. THE Encoder and THE Sealer SHALL write the Magic_Nibble into bits 7 to 4 of the first Packet byte and the value 1 (Version_Nibble) into bits 3 to 0 of the first Packet byte.
2. IF the Decoder or the Opener receives bytes whose Magic_Nibble (bits 7 to 4 of the first byte) differs from the defined Magic_Nibble value, THEN THE Decoder or THE Opener SHALL return a Codec_Error with code `bad-magic` and SHALL NOT return a Payload.
3. IF the Decoder or the Opener receives bytes whose Magic_Nibble matches and whose Version_Nibble (bits 3 to 0 of the first byte) differs from 1, THEN THE Decoder or THE Opener SHALL return a Codec_Error with code `unsupported-version` and SHALL NOT return a Payload.
4. IF the Decoder or the Opener receives fewer than 3 bytes, including an empty input of 0 bytes, THEN THE Decoder or THE Opener SHALL return a Codec_Error with code `truncated` before evaluating the Magic_Nibble or Version_Nibble.
5. WHEN the Decoder or the Opener receives 3 or more bytes whose Magic_Nibble matches the defined value and whose Version_Nibble equals 1, THE Decoder or THE Opener SHALL accept the header and continue decoding the remaining bytes.

### Requirement 2: Type and flags

**User Story:** As a developer, I want a type byte and a flags byte, so that the receiver knows how to interpret the Body.

#### Acceptance Criteria

1. THE Encoder and THE Sealer SHALL write the Type byte as the second Packet byte (byte index 1), using one distinct value in the range 0 to 5 for each of text, url, wifi, contact, checkin and hunt-clue.
2. IF the Decoder or the Opener receives a Type byte that matches none of the six defined type values, THEN THE Decoder or THE Opener SHALL return a Codec_Error with code `unknown-type` and no Payload.
3. THE Encoder and THE Sealer SHALL write the Flags byte as the third Packet byte (byte index 2), with one distinct bit for each of sealed, compressed and multipart, and with all other bits set to 0.
4. IF the Decoder or the Opener receives a Flags byte with any bit set outside the three defined flag bits, THEN THE Decoder or THE Opener SHALL return a Codec_Error with code `reserved-flags` and no Payload.
5. WHEN the Decoder or the Opener receives a valid Packet whose Flags byte has the multipart bit set, THE Decoder or THE Opener SHALL return the multipart flag value together with the Body bytes exactly as received (after decryption for a Sealed_Packet), and SHALL NOT combine the Body with any other Packet.
6. WHEN the Decoder or the Opener receives a Packet with a valid Type byte and a valid Flags byte, THE Decoder or THE Opener SHALL return the Type and the sealed, compressed and multipart flag values, so that encoding then decoding yields the original Type and flag values for every combination of the six types and eight flag combinations.

### Requirement 3: Size cap

**User Story:** As a sender, I want the encoder to refuse oversize packets, so that ggwave never silently truncates my data.

#### Acceptance Criteria

1. THE Encoder and THE Sealer SHALL produce Packets of at most 140 bytes, where the length is the total byte count of the returned `Uint8Array`, including the Header, Type, Flags, and, for a Sealed_Packet, the Sender_ID, Counter and Tag bytes.
2. IF the encoded Packet would exceed the Size_Cap of 140 bytes, THEN THE Encoder or THE Sealer SHALL return a Codec_Error with code `too-large` and the computed Packet length in bytes, SHALL NOT return a truncated Packet, and SHALL NOT modify the input Payload.
3. IF a Payload is empty (0 bytes of content) or exceeds a type-specific field limit defined in the design, THEN THE Encoder or THE Sealer SHALL return a Codec_Error with code `invalid-payload` that identifies the offending field, and SHALL NOT return a Packet.
4. THE Encoder and THE Sealer SHALL accept Payload input and return Packet output as `Uint8Array` values.

### Requirement 4: Text payloads

**User Story:** As a host, I want to send plain text, so that attendees receive a short message.

#### Acceptance Criteria

1. WHEN a text Payload is encoded, THE Encoder SHALL write the Body as the UTF-8 bytes of the text with the compressed flag clear.
2. WHEN a text Packet is decoded, THE Decoder SHALL return the text decoded from the Body as UTF-8, with every character identical to the text originally encoded.
3. IF a text Body contains an invalid UTF-8 sequence, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`, return no partial text, and leave the input bytes unmodified.
4. IF a text Payload is empty (0 characters), THEN THE Encoder SHALL return a Codec_Error with code `invalid-payload` and SHALL NOT produce a Packet.
5. IF the UTF-8 encoding of a text Payload makes the Packet exceed the Size_Cap, THEN THE Encoder SHALL return a Codec_Error with code `too-large`, as specified in Requirement 3.
6. IF the Decoder receives a text Packet with the compressed flag set, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`, because the Encoder never sets the compressed flag on a text Packet.

### Requirement 5: URL compression

**User Story:** As a host, I want links to be short on the wire, so that more links fit in one Packet.

#### Acceptance Criteria

1. WHEN a url Payload with an `https://` or `http://` scheme (matched case-insensitively) is encoded, THE Encoder SHALL remove the scheme from the Body and record which of the two schemes was removed.
2. WHEN a url Payload is encoded and the URL host begins with a prefix listed in the Prefix_Table, THE Encoder SHALL replace the longest matching prefix with its one-byte code.
3. WHEN a url Payload is encoded, THE Encoder SHALL set the compressed flag if and only if the scheme was removed or a Prefix_Table prefix was replaced, and SHALL leave the flag clear otherwise.
4. WHEN a url Packet with the compressed flag set is decoded, THE Decoder SHALL restore the recorded scheme and expand any Prefix_Table code to the original prefix, so that the decoded URL equals the URL passed to the Encoder, apart from the scheme's letter case, which is normalized to lowercase.
5. IF a url Payload has a scheme other than `http` or `https`, or has no scheme, THEN THE Encoder SHALL return a Codec_Error with code `invalid-payload` and SHALL NOT produce a Packet.
6. IF a url Body contains a Prefix_Table code that is not defined in the Prefix_Table, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body` and SHALL NOT return a partial URL.
7. IF a url Packet has the compressed flag set but its Body does not carry a recorded scheme, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`.
8. THE Prefix_Table SHALL be a single definition in `packages/core` used by both the Encoder and the Decoder, so that every code maps to the same prefix in both directions.
9. WHEN the Decoder receives a url Packet with the compressed flag clear, THE Decoder SHALL treat the Body as the literal UTF-8 URL, and IF that URL does not start with `http://` or `https://` (matched case-insensitively), THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`.

### Requirement 6: Wi-Fi credential packing

**User Story:** As a host, I want to share Wi-Fi credentials, so that attendees can join the network without typing.

#### Acceptance Criteria

1. WHEN a wifi Payload is encoded, THE Encoder SHALL pack the Body as one security-type byte, a one-byte SSID length, the SSID bytes, a one-byte password length and the password bytes, with the compressed flag set.
2. THE Encoder SHALL support exactly three security types: open, WPA and WEP, each with a distinct one-byte value.
3. WHEN a wifi Payload with security type open is encoded, THE Encoder SHALL write a password length of 0 and omit the password bytes from the Body.
4. WHEN a wifi Packet is decoded, THE Decoder SHALL return the SSID, password and security type, and SHALL return an empty password when the security type is open.
5. IF a wifi Body has an SSID length or password length that exceeds the remaining Body bytes, a security-type byte that does not match a defined security type, or bytes left over after the password, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`.
6. IF an SSID is 0 bytes or exceeds 32 bytes, or a password exceeds 63 bytes, after UTF-8 encoding, THEN THE Encoder SHALL return a Codec_Error with code `invalid-payload`.
7. IF the security type is WPA or WEP and the password is 0 bytes after UTF-8 encoding, THEN THE Encoder SHALL return a Codec_Error with code `invalid-payload`.
8. IF the security type is open and the password is non-empty, THEN THE Encoder SHALL return a Codec_Error with code `invalid-wifi` and SHALL NOT produce a Packet, rather than silently dropping the password.
9. FOR ALL wifi Payloads that the Encoder accepts, THE Decoder SHALL return a Payload equal to the original in SSID, password and security type, because an accepted open-network Payload always has an empty password and therefore equals the empty password that the Decoder returns (round-trip property).
10. IF the Decoder receives a wifi Packet with the compressed flag clear, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`, because the Encoder always sets the compressed flag on a wifi Packet.
11. IF a wifi Body has an SSID that is 0 bytes or exceeds 32 bytes, a password that exceeds 63 bytes, a non-empty password with security type open, an empty password with security type WPA or WEP, or an SSID or password that is not valid UTF-8, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`.

### Requirement 7: Contact, check-in and hunt-clue payloads

**User Story:** As an organiser, I want contact cards, check-in codes and hunt clues, so that Screech covers its core use cases.

#### Acceptance Criteria

1. WHEN a contact, checkin or hunt-clue Payload is encoded, THE Encoder SHALL write the Body as the UTF-8 bytes of the Payload text with the compressed flag clear.
2. WHEN a contact, checkin or hunt-clue Packet is decoded, THE Decoder SHALL return the Body decoded as UTF-8 text with the matching Type.
3. IF a contact, checkin or hunt-clue Body contains an invalid UTF-8 sequence, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body` and SHALL NOT return any partial text.
4. IF a contact, checkin or hunt-clue Payload text is empty (0 characters), THEN THE Encoder SHALL return a Codec_Error with code `invalid-payload` and SHALL NOT produce a Packet.
5. WHEN a contact, checkin or hunt-clue Payload that fits the Size_Cap is encoded and the resulting Packet is decoded, THE Decoder SHALL return text identical to the original Payload text, including multi-byte characters.
6. IF the Decoder receives a contact, checkin or hunt-clue Packet with the compressed flag set, THEN THE Decoder SHALL return a Codec_Error with code `invalid-body`, because the Encoder never sets the compressed flag on these Packets.

### Requirement 8: Sealed packets

**User Story:** As a host, I want to encrypt a Packet with a room key, so that only devices that hold the key can read it.

#### Acceptance Criteria

1. WHEN the Sealer is called with a Payload, a Room_Key, a Sender_ID and a Counter, THE Sealer SHALL return a Promise that resolves to a Sealed_Packet with the layout Header, Type, Flags, Sender_ID (4 bytes), Counter (2 bytes, big-endian), encrypted Body, Tag (8 bytes), with the sealed flag set.
2. THE Sealer SHALL encrypt the Body with AES-GCM using the Room_Key and SHALL request a tag length of 64 bits from Web Crypto.
3. THE Sealer SHALL derive the 12-byte Nonce as the Sender_ID (4 bytes), then the Counter (2 bytes, big-endian), then 6 zero bytes, so that two different (Sender_ID, Counter) pairs produce two different Nonces and the same pair always produces the same Nonce.
4. THE Sealer SHALL pass the Header, Type and Flags bytes to AES-GCM as additional authenticated data.
5. WHEN the Opener is called with a Sealed_Packet and the correct Room_Key, THE Opener SHALL return a Promise that resolves to a Payload equal to the original Payload.
6. IF the header checks of Requirement 1 and Requirement 2 pass and the Tag does not verify, including when any Header, Type, Flags, Sender_ID, Counter, Body or Tag byte has been altered to a value that still passes the header checks, THEN THE Opener SHALL resolve to a Codec_Error with code `auth-failed` and no Payload.
7. IF the header checks of Requirement 1 or Requirement 2 reject a Packet, THEN THE Opener SHALL resolve to a Codec_Error carrying only the header-level code from Requirement 1 or 2 and SHALL NOT report `auth-failed` for that Packet.
8. IF the Opener is called with a Sealed_Packet and the Room_Key is missing, THEN THE Opener SHALL resolve to a Codec_Error with code `key-required` and no Payload, without attempting decryption.
9. IF the Room_Key is not exactly 16 bytes, THEN THE Sealer or THE Opener SHALL resolve to a Codec_Error with code `invalid-key` and no output Packet or Payload.
10. IF the input to the Opener has the sealed flag set and is shorter than 17 bytes (the Sealed_Overhead), THEN THE Opener SHALL resolve to a Codec_Error with code `truncated` and no Payload, before any decryption is attempted.
11. THE Codec SHALL use only the Web Crypto `SubtleCrypto` API for AES-GCM.
12. IF the caller supplies a Counter that is not an integer from 0 to 65535 inclusive, THEN THE Sealer SHALL resolve to a Codec_Error with code `invalid-counter` and no Packet.
13. IF the caller supplies a Sender_ID that is not a `Uint8Array` of exactly 4 bytes, THEN THE Sealer SHALL resolve to a Codec_Error with code `invalid-sender-id` and no Packet.
14. THE Sealer SHALL count the Sealed_Overhead of 17 bytes (Header, Type and Flags: 3; Sender_ID: 4; Counter: 2; Tag: 8) toward the Size_Cap, so that a Sealed_Packet's total length does not exceed 140 bytes.
15. IF a Sealed_Packet would exceed the Size_Cap after adding the Sealed_Overhead, THEN THE Sealer SHALL resolve to a Codec_Error with code `too-large` and no Packet.
16. IF the Opener receives a Packet whose sealed flag is clear, THEN THE Opener SHALL resolve to a result value that is a Codec_Error (an Err result, not a Payload) with code `not-sealed`.
17. IF the Decoder receives a Packet whose sealed flag is set, THEN THE Decoder SHALL return a Codec_Error with code `key-required` and no Payload, without attempting decryption.

### Requirement 9: Sender state rotation

**User Story:** As a sender, I want a helper that advances my Sender_ID and Counter, so that I never encrypt two messages with the same Nonce under one Room_Key.

#### Acceptance Criteria

1. WHEN the Rotation_Helper is called without a Sender_State, THE Rotation_Helper SHALL return a Sender_State with a fresh 4-byte Sender_ID generated by Web Crypto `getRandomValues` and a Counter of 0.
2. WHEN the Rotation_Helper is called with a Sender_State whose Counter is less than 65535, THE Rotation_Helper SHALL return a Sender_State with the same Sender_ID and a Counter increased by 1.
3. WHEN the Rotation_Helper is called with a Sender_State whose Counter is 65535, THE Rotation_Helper SHALL return a Sender_State with a fresh 4-byte Sender_ID that differs from the supplied Sender_ID and a Counter of 0.
4. FOR ALL sequences of Sender_State values produced by repeated calls to the Rotation_Helper with a random source that never returns the same Sender_ID twice, THE Rotation_Helper SHALL NOT return the same (Sender_ID, Counter) pair as an earlier call in the same sequence, so that no Nonce is reused within the sequence.
5. IF the Rotation_Helper receives a Counter that is not an integer from 0 to 65535 inclusive, THEN THE Rotation_Helper SHALL return a Codec_Error with code `invalid-counter` and no Sender_State.
6. IF the Rotation_Helper receives a Sender_ID that is not a `Uint8Array` of exactly 4 bytes, THEN THE Rotation_Helper SHALL return a Codec_Error with code `invalid-sender-id` and no Sender_State.
7. THE Rotation_Helper SHALL be the only Codec function that generates random values, and THE Rotation_Helper SHALL be synchronous.

### Requirement 10: Purity and platform

**User Story:** As a developer, I want the codec to run in every target browser, so that senders and receivers on iOS Safari and Chrome interoperate.

#### Acceptance Criteria

1. THE Encoder and THE Decoder SHALL be synchronous functions that return a Packet, a Payload or a Codec_Error directly and do not return a Promise.
2. THE Sealer and THE Opener SHALL be asynchronous functions that return a Promise resolving to a Packet, a Payload or a Codec_Error.
3. THE Encoder, THE Decoder, THE Sealer and THE Opener SHALL return byte-for-byte identical output for identical inputs, where the Sender_ID, Counter and Room_Key are supplied by the caller and no random value or clock reading is used.
4. THE Codec source files in `packages/core/src` SHALL use only ECMAScript and Web APIs available in the current stable release of iOS Safari and the current stable release of Chrome (Android and desktop), and SHALL NOT reference Node.js-specific APIs. This restriction applies to `packages/core/src` only; test files in `packages/core/tests` MAY use Node.js APIs such as `node:crypto`.
5. WHEN the Codec is called with a `Uint8Array` input, THE Codec SHALL leave every byte of that input unchanged, and SHALL NOT retain a reference to it in the returned output.
6. IF the Codec receives malformed input, including empty, truncated, over-length or corrupted bytes, THEN THE Codec SHALL return a Codec_Error value identifying the failure category and SHALL NOT throw an exception.
7. IF the Codec receives an input of the wrong type (for example `null`, `undefined`, or a non-`Uint8Array` value where a `Uint8Array` is required), THEN THE Codec SHALL return a Codec_Error value and SHALL NOT throw an exception.
8. IF the Sealer or the Opener receives bad input or a Web Crypto operation fails, THEN THE Sealer or THE Opener SHALL resolve its Promise to a Codec_Error and SHALL NOT reject the Promise.
9. IF Web Crypto `SubtleCrypto` is unavailable (for example on a page served over HTTP) or fails for a reason other than a Tag mismatch, THEN THE Sealer or THE Opener SHALL resolve to a Codec_Error with code `crypto-unavailable` and no Packet or Payload.
10. IF `crypto.getRandomValues` is unavailable or fails, THEN THE Rotation_Helper SHALL return a Codec_Error with code `crypto-unavailable` and no Sender_State.
11. IF the Decoder or the Opener receives an input that is not a `Uint8Array`, THEN THE Decoder or THE Opener SHALL return a Codec_Error with code `invalid-payload` and field `packet`, and no Payload.

### Requirement 11: Round-trip

**User Story:** As a developer, I want decoding to invert encoding, so that no payload changes in transit.

#### Acceptance Criteria

1. FOR ALL valid Payloads whose encoded Packet is at most the Size_Cap in bytes (a wifi Payload with security type open and a non-empty password is not valid and yields `invalid-wifi` per Requirement 6), THE Decoder SHALL produce a Payload equal to the original in type and in every field value when decoding the Packet produced by THE Encoder (round-trip property).
2. FOR ALL valid Payloads whose encoded Sealed_Packet is at most the Size_Cap in bytes, FOR ALL 16-byte Room_Keys, 4-byte Sender_IDs and Counters from 0 to 65535, THE Opener SHALL resolve to a Payload equal to the original in type and in every field value when opening the Sealed_Packet with the same Room_Key used to seal it.
3. WHEN THE Encoder is invoked twice with identical Payload, THE Encoder SHALL produce byte-for-byte identical Packets. WHEN THE Sealer is invoked twice with identical Payload, Room_Key, Sender_ID and Counter, THE Sealer SHALL produce byte-for-byte identical Sealed_Packets (determinism).
4. IF a Sealed_Packet is opened with a 16-byte Room_Key different from the one used to seal it, THEN THE Opener SHALL resolve to a Codec_Error with code `auth-failed`, SHALL NOT return any Payload, and SHALL NOT throw an exception.

### Requirement 12: Property-based and unit tests

**User Story:** As a maintainer, I want property-based tests and unit tests for the Codec, so that regressions are caught by `pnpm test`.

#### Acceptance Criteria

1. THE Codec test suite SHALL include a fast-check property that decoding an encoded Packet returns a Payload equal to the original Payload for any valid Payload and every Type, and a fast-check property that the Encoder and the Sealer return a Codec_Error with code `invalid-wifi` for every wifi Payload with security type open and a non-empty password (such Payloads being excluded from the round-trip cases), and a fast-check property that opening a sealed Packet returns a Payload equal to the original Payload for any valid Payload, every Type, any 16-byte Room_Key, any 4-byte Sender_ID and any Counter from 0 to 65535.
2. THE Codec test suite SHALL include a fast-check property that, for any Sealed_Packet and any single bit position in it, flipping that bit causes the Opener to resolve to a Codec_Error and never a Payload, and the property SHALL accept any Codec_Error code.
3. THE Codec test suite SHALL include a fast-check property that, for any generated Payload, the Encoder returns either a Packet of 140 bytes or fewer or a Codec_Error, and the Sealer resolves to either a Sealed_Packet of 140 bytes or fewer or a Codec_Error, and neither ever returns a Packet over 140 bytes.
4. THE Codec test suite SHALL include a fast-check property that, for any byte array from 0 to 300 bytes in length, the Decoder returns either a Codec_Error or a Payload and does not throw an exception, and THE Codec test suite SHALL require this property to pass.
5. THE Codec test suite SHALL include a fast-check property that, for any byte array from 0 to 300 bytes in length, the Promise returned by the Opener always resolves to either a Codec_Error or a Payload and is never rejected, and THE Codec test suite SHALL require this property to pass.
6. THE Codec test suite SHALL include a fast-check property that the Nonce derived from two different (Sender_ID, Counter) pairs differs, and fast-check properties that the Rotation_Helper increments the Counter below 65535, returns a Sender_ID different from the replaced one with Counter 0 at 65535 (even when the random source returns the replaced Sender_ID), and returns `invalid-counter` or `invalid-sender-id` for invalid input.
7. THE Codec test suite SHALL include unit tests with fixed example bytes covering each Type, each defined Codec_Error code (`bad-magic`, `unsupported-version`, `truncated`, `unknown-type`, `reserved-flags`, `too-large`, `invalid-payload`, `invalid-wifi`, `invalid-body`, `auth-failed`, `key-required`, `invalid-key`, `invalid-counter`, `invalid-sender-id`, `not-sealed`, `crypto-unavailable`), and a Sealed_Packet of 16 bytes that the Opener rejects with `truncated` and a Sealed_Packet of 17 bytes that the Opener does not reject with `truncated`.
8. THE Codec test suite SHALL include unit tests for the Size_Cap boundaries: an unsealed Packet of exactly 140 bytes (137-byte Body) that the Encoder produces and the Decoder accepts, an unsealed Payload that would encode to 141 bytes that the Encoder rejects with `too-large`, a Sealed_Packet of exactly 140 bytes (123-byte Body) that the Sealer produces and the Opener accepts, and a Sealed_Packet that would be 141 bytes (124-byte Body) that the Sealer rejects with `too-large`.
9. THE Codec test suite SHALL include unit tests with fixed example bytes for the Rotation_Helper covering the initial state, a Counter increment, a Counter of 65535 that rotates the Sender_ID and resets the Counter to 0, and the `invalid-counter` and `invalid-sender-id` errors.
10. WHEN `pnpm test` runs from the repository root, THE Codec test suite SHALL run, report 0 failed tests, and cause `pnpm test` to exit with code 0.
11. THE Codec test suite SHALL configure each fast-check property to run at least 100 generated cases.
12. IF any fast-check property fails, THEN THE Codec test suite SHALL report the failing test and the counterexample, including the seed, so that the failure can be replayed, and `pnpm test` SHALL exit with a non-zero code.
13. THE Codec test suite SHALL include a single deterministic unit test (not a fast-check property) that calls the Rotation_Helper 70,000 consecutive times, starting from no Sender_State and using an injected random source that never returns the same Sender_ID twice, and verifies that no (Sender_ID, Counter) pair repeats.
14. THE Codec test suite SHALL include a known-answer unit test for the Sealer with a fixed Room_Key, Sender_ID, Counter and Payload, and THE Codec test suite SHALL compute the expected Sealed_Packet bytes in `packages/core/tests/helpers.ts` using Node.js `node:crypto`, independently of the Codec code under test, and SHALL NOT take the expected bytes from the Sealer.
15. WHEN the full `packages/core` test suite runs, THE Codec test suite SHALL complete in under 20 seconds.

## Open Issues for Design

- **Nonce uniqueness across senders**: Resolved. Each Sealed_Packet carries a 4-byte Sender_ID before the Counter, the Nonce is built from both, and the Rotation_Helper (Requirement 9) rotates the Sender_ID when the Counter would wrap. The Encoder and Sealer stay stateless, so the caller must pass the Sender_State returned by the Rotation_Helper and must not reuse a (Sender_ID, Counter) pair.
- **Multipart**: The flag is carried but reassembly is out of scope for this spec.

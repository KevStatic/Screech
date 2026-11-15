# Requirements Document

## Introduction

The Spirit_Box_App is the Screech web app in `apps/web` (React 18 + Vite, portrait phones from 320 px to 430 px wide, designed at 390 px). It sends and receives Packets as sound. It uses `@screech/core` for the protocol (`encode`, `decode`, `SIZE_CAP`) and ggwave 0.4.0 (WASM) for audio. It rebuilds screens 1 to 5 of the mockup in `docs/design/`: Awaken, Speak, Screeching, Listen and Reveal.

Out of scope for this spec: sealed rooms and pact key sharing, the Cursed screen, the Séance room, the check-in API, PWA install and offline use. A sealed Packet received here only produces a "pact required" message.

The app must work over HTTPS on iOS Safari and Android Chrome. Pure logic (Wi-Fi QR string, vCard, byte budget, decode-result mapping) lives in testable pure functions. The audio engine lives in `apps/web/src/audio`, separate from the UI.

## Glossary

- **Spirit_Box_App**: The React web app in `apps/web`.
- **Core**: The `@screech/core` package, added to `apps/web` as a workspace dependency (`workspace:*`).
- **Packet**: A byte sequence produced by Core `encode()` and consumed by Core `decode()`, at most `SIZE_CAP` (140) bytes.
- **Audio_Engine**: The modules in `apps/web/src/audio` that wrap ggwave, the AudioContext, the microphone and playback. It contains no React code.
- **Audio_Context**: The browser `AudioContext` created or resumed by the Audio_Engine.
- **Sample_Rate**: `Audio_Context.sampleRate`, read at runtime.
- **Awaken_Screen**: Screen 1. Boot sequence, microphone unlock and Exorcise toggle.
- **Speak_Screen**: Screen 2. Tarot cards, per-type inputs, byte candle, seal toggle and SCREECH key.
- **Screeching_Screen**: Screen 3. Oscilloscope and progress during transmission.
- **Listen_Screen**: Screen 4. Spectrogram, Screech band and K-II meter.
- **Reveal_Screen**: Screen 5. Ouija spelling and action card.
- **Tarot_Card**: A selectable card for one send type: text, url, wifi or contact.
- **Byte_Candle**: The gauge on the Speak_Screen showing the Packet size against `SIZE_CAP`.
- **Packet_Size**: Length in bytes of the Packet returned by Core `encode()` for the current inputs.
- **SCREECH_Key**: The control that starts a transmission.
- **Hold_Duration**: 300 ms of continuous press (pointer or keyboard) required to activate the SCREECH_Key.
- **Hold_State_Machine**: The pure state machine that turns press, release, cancel and elapsed-time events into idle, holding or fired.
- **Oscilloscope**: The waveform display on the Screeching_Screen.
- **Spectrogram**: The scrolling frequency display on the Listen_Screen, fed by an `AnalyserNode`.
- **Screech_Band**: The frequency range from 1875 Hz to 6400 Hz inclusive, the measured range of the ggwave audible-fast tones, highlighted on the Spectrogram.
- **Transmit_Volume**: The single named constant holding the ggwave encode volume, an integer from 1 to 100 with a default of 50. The spike's volume of 10 reached only about 1.5 m.
- **K_II_Meter**: The level meter on the Listen_Screen showing signal energy inside the Screech_Band.
- **Exorcise_Toggle**: The control that turns all motion off. Its state is saved in `localStorage`.
- **Reduced_Motion**: The `prefers-reduced-motion: reduce` media query matching, or the Exorcise_Toggle being on.
- **UI_Sound**: Any sound the Spirit_Box_App itself plays other than a Packet transmission.
- **Decode_Result**: The `Result<DecodedPacket>` returned by Core `decode()`.
- **Screen_State**: The pure mapping outcome of a Decode_Result: `ignore`, `reveal`, `garbled` or `pact-required`.
- **Room_Noise_Error**: A Core error code in the set `bad-magic`, `unsupported-version`, `truncated`, `unknown-type`, `reserved-flags`.
- **Ouija_Spelling**: The letter-by-letter reveal animation of the decoded value.
- **Action_Card**: The card shown after Ouija_Spelling, with actions that depend on the Packet type.
- **Wifi_QR_String**: A string of the form `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;;`.
- **VCard_Builder**: The pure function that builds a vCard (`.vcf`) text from contact fields.
- **Spirit_Wave**: The ggwave audio protocol used for sending, `GGWAVE_PROTOCOL_AUDIBLE_FAST`, as proven in `apps/spike`.
- **User_Activation**: A browser user-activation event (`click`, `keydown`, `pointerup` or `touchend`). A hold timer expiring and `pointerdown` or `touchstart` are not User_Activation events on iOS Safari.
- **unlockAudio**: The Audio_Engine function that, called synchronously inside a User_Activation handler, creates the Audio_Context if none exists or calls `resume()` on it if its state is not running, awaits the `resume()` promise, and only then reads the Audio_Context state. It reports success only when that state is running.
- **ensureRunning**: The Audio_Engine keep-alive function that calls `resume()` on an existing Audio_Context only when its state is not running. It creates no Audio_Context and reports no outcome.
- **Wake_Control**: The in-theme control with the visible text "Tap to wake the box" that the Speak_Screen shows when the Hold_Duration elapses while the Audio_Context is not running. A tap on it runs unlockAudio and then starts the pending transmission.

## Requirements

### Requirement 1: Project setup and dependencies

**User Story:** As a developer, I want the web app wired to Core, ggwave, fonts and QR generation, so that the screens can be built on shared, tested logic.

#### Acceptance Criteria

1. THE Spirit_Box_App SHALL declare `@screech/core` as a `workspace:*` dependency in `apps/web/package.json`, matching the declaration in `apps/spike/package.json`.
2. THE Spirit_Box_App SHALL declare `ggwave` pinned to exactly version 0.4.0 (no range operator) and `qrcode` as dependencies in `apps/web/package.json`.
3. THE Spirit_Box_App SHALL declare `@fontsource/vt323`, `@fontsource/special-elite` and `@fontsource/creepster` as dependencies in `apps/web/package.json`, and SHALL import each font from its package so that the font files are served from the app's own origin.
4. WHEN the Spirit_Box_App is loaded in a browser, THE Spirit_Box_App SHALL make zero requests to any origin other than its own, including requests for fonts, stylesheets and scripts.
5. THE Spirit_Box_App SHALL import all protocol, compression and crypto logic (frame layout, body encoding, prefix compression, seal and open) from `@screech/core` and SHALL NOT reimplement it in `apps/web/src`.
6. WHEN `pnpm install` and then `pnpm build` run from the repository root on a clean checkout, THE Spirit_Box_App SHALL install and build with exit code 0 and no unresolved-import errors for `@screech/core`, `ggwave`, `qrcode` or the three font packages.
7. WHEN `pnpm test` runs from the repository root, THE Spirit_Box_App SHALL run its unit and property tests, and THE command SHALL exit with a non-zero code if any of those tests fail.

### Requirement 2: Theme and accessibility

**User Story:** As a phone user, I want a readable, touch-friendly spirit-box look, so that I can use the app on a small screen.

#### Acceptance Criteria

1. THE Spirit_Box_App SHALL use the colour tokens from `docs/design/README.md`: background `#050806`, phosphor green `#39ff7a`, secondary green `#5aa86c` and bone white `#e9e4d4`.
2. THE Spirit_Box_App SHALL use blood red (`#ff3b3b`, `#ff5a5a`, `#ff8a7a`) only for curses, errors and the seal, and SHALL use phosphor green for primary actions and signal indicators.
3. THE Spirit_Box_App SHALL use VT323 for UI text, Special Elite for ghost-written notes and Creepster for titles only, with all three fonts self-hosted so that no font request goes to a third-party origin.
4. THE Spirit_Box_App SHALL lay out every screen, designed at 390 px, for every portrait viewport width from 320 px to 430 px inclusive, with a document scroll width no greater than the viewport width, so that no horizontal scrolling occurs.
5. THE Spirit_Box_App SHALL give every interactive control a touch target of at least 44 px by 44 px at every viewport width from 320 px to 430 px inclusive.
6. THE Spirit_Box_App SHALL render text with a contrast ratio of at least 4.5:1 against its background, measured with the WCAG 2.1 contrast formula.
7. THE Spirit_Box_App SHALL tie every visual effect to a real state value (signal level, byte count, progress or playback time), and SHALL show no effect when that state value is absent or zero.
8. THE Spirit_Box_App SHALL use no emoji, no gradient washes and no flashlight-cursor effect.
9. IF an error occurs, THEN THE Spirit_Box_App SHALL show an error message in plain words that states what happened, includes the measured value and the limit where one applies (for example "Too heavy to cross over (148/140 bytes)"), and keeps the user's entered data unchanged.
10. THE Spirit_Box_App SHALL flash no element more than 3 times in any 1-second period.

### Requirement 3: Motion control and Exorcise toggle

**User Story:** As a user sensitive to motion, I want to switch all animation off, so that the app is comfortable to use.

#### Acceptance Criteria

1. WHILE Reduced_Motion is active, THE Spirit_Box_App SHALL render every element with an animation duration of 0 ms and a transition duration of 0 ms, including the CRT boot flicker, Ouija_Spelling movement, scanline drift and Spectrogram scrolling smoothing.
2. WHEN the user changes the Exorcise_Toggle, THE Spirit_Box_App SHALL apply the new value to Reduced_Motion within 100 ms and save the new value in `localStorage`.
3. WHEN the Spirit_Box_App starts, THE Spirit_Box_App SHALL read the saved Exorcise_Toggle value from `localStorage` before the first screen is rendered, so that no animation plays when the saved value is on.
4. IF `localStorage` is unavailable, throws an error on read or write, or holds a value other than the two values the app writes for on and off, THEN THE Spirit_Box_App SHALL treat the Exorcise_Toggle as off, keep the in-memory toggle value for the current session, and continue without an error screen.
5. WHILE the `prefers-reduced-motion: reduce` media query matches, THE Spirit_Box_App SHALL treat Reduced_Motion as active regardless of the saved Exorcise_Toggle value and SHALL show the Exorcise_Toggle in the on position and disabled, with visible text stating that the system setting is in effect.
6. WHEN the `prefers-reduced-motion` media query match state changes while the app is open, THE Spirit_Box_App SHALL update Reduced_Motion within 100 ms without a reload and without clearing the saved Exorcise_Toggle value.
7. WHILE Reduced_Motion is active, THE Spirit_Box_App SHALL show signal strength, byte counts and transmission progress as static text or static graphics that update only when the underlying value changes, so that no function depends on motion.
8. THE Spirit_Box_App SHALL render the Exorcise_Toggle with a touch target of at least 44 px by 44 px and a text contrast ratio of at least 4.5:1.

### Requirement 4: Awaken screen

**User Story:** As a user, I want a boot screen that unlocks audio and the microphone with one tap, so that the browser allows sound and listening.

#### Acceptance Criteria

1. WHEN the Spirit_Box_App starts, THE Awaken_Screen SHALL show the CRT boot sequence, the Awaken control and the Exorcise_Toggle within 500 ms of first render.
2. WHEN the user taps the Awaken control, THE Audio_Engine SHALL run unlockAudio, which, synchronously inside that tap handler, creates the Audio_Context if none exists, or calls `resume()` on it if its state is not running, and SHALL await the promise returned by `resume()` before reading the Audio_Context state.
3. WHEN the awaited `resume()` promise has settled and the Audio_Context state read after that is running, THE Audio_Engine SHALL request microphone access with echo cancellation, noise suppression and auto gain control all turned off, and SHALL keep the same Audio_Context for later transmissions, so that the Awaken tap is the unlock that later sends rely on.
4. WHEN microphone access is granted, THE Spirit_Box_App SHALL move to the Speak_Screen within 500 ms.
5. IF microphone access is denied, THEN THE Awaken_Screen SHALL stay visible and show an in-theme message that says the microphone was refused, that Screech cannot hear without it, and how to allow it in the browser settings.
6. IF microphone access is denied, THEN THE Awaken_Screen SHALL offer a retry control and a control to continue to the Speak_Screen without listening, each with a touch target of at least 44 px.
7. WHEN the user taps the retry control, THE Audio_Engine SHALL request microphone access again, up to a maximum of 3 consecutive attempts per page load, after which THE Awaken_Screen SHALL show only the continue-without-listening control and the browser-settings instructions.
8. IF the Audio_Context state read after the awaited `resume()` promise has settled is not running, or the `resume()` promise rejects, THEN THE Awaken_Screen SHALL stay visible, SHALL NOT request microphone access, and SHALL show an in-theme message stating in plain words that audio could not start, with a retry control.
9. IF the browser has no `mediaDevices.getUserMedia` or the page is not in a secure context, THEN THE Awaken_Screen SHALL show an in-theme message that states which of the two causes applies in plain words, SHALL NOT request microphone access, and SHALL offer the control to continue to the Speak_Screen without listening.
10. WHILE the microphone is unavailable (denied, unsupported, insecure context, or continued without listening), THE Spirit_Box_App SHALL keep the Listen_Screen unavailable and SHALL state the specific reason on that screen.
11. THE Awaken_Screen SHALL label the Exorcise_Toggle with its current state (on or off), and WHEN the user taps the Exorcise_Toggle, THE Awaken_Screen SHALL update the label and disable all motion within 100 ms.

### Requirement 5: Speak screen inputs

**User Story:** As a sender, I want to choose a type and fill in its fields, so that I can send text, a link, Wi-Fi details or a contact.

#### Acceptance Criteria

1. THE Speak_Screen SHALL show exactly four Tarot_Cards, one each for text, url, wifi and contact, and each Tarot_Card SHALL have a touch target of at least 44 px by 44 px.
2. WHEN the Speak_Screen first opens in a session, THE Speak_Screen SHALL select the text Tarot_Card.
3. WHEN the user selects a Tarot_Card, THE Speak_Screen SHALL show only the inputs for that type and SHALL retain the values already entered for the other three types until the page is reloaded.
4. WHERE the selected type is text, THE Speak_Screen SHALL show a single-field text input and no other type's inputs.
5. WHERE the selected type is url, THE Speak_Screen SHALL show a single-field URL input and no other type's inputs.
6. WHERE the selected type is wifi, THE Speak_Screen SHALL show a text input for SSID, a text input for password, and a security choice with exactly three options (open, wpa, wep), with wpa selected by default.
7. WHERE the selected type is contact, THE Speak_Screen SHALL show three separate text inputs for name, phone and email.
8. IF the selected type has no content, THEN THE Speak_Screen SHALL disable the SCREECH_Key and show a message stating that nothing has been written yet. A type has no content when: for text and url, the input is empty or only whitespace; for wifi, the SSID input is empty or only whitespace; for contact, the name, phone and email inputs are all empty or only whitespace.
9. WHEN the selected type changes from having no content to having content, THE Speak_Screen SHALL enable the SCREECH_Key and remove the "nothing written" message within 100 ms.
10. THE Speak_Screen SHALL show the seal toggle in a disabled state with visible text stating that sealed messages arrive in a later release, and the toggle SHALL NOT change state when activated by tap or keyboard.
11. THE Speak_Screen SHALL set `aria-pressed="true"` on the selected Tarot_Card and `aria-pressed="false"` on the other three, and SHALL give the selected Tarot_Card a visible style that differs from the unselected ones.

### Requirement 6: Contact payload and vCard

**User Story:** As a sender and receiver, I want contacts sent compactly and saved as a standard vCard, so that people can add them to their phone.

#### Acceptance Criteria

1. WHEN the sender submits a contact name, phone and email, THE Spirit_Box_App SHALL convert them into the text of a Core `contact` Payload using a pure function that performs no I/O and returns identical output for identical input.
2. WHEN the Spirit_Box_App receives a Core `contact` Payload, THE Spirit_Box_App SHALL parse its text into name, phone and email using a pure function, and SHALL return an empty string for a phone or email that was not sent.
3. FOR ALL contact fields that contain no newline (LF or CR) and no field-separator characters, parsing the contact text built from them SHALL return fields equal to the originals (round-trip property).
4. IF a contact field contains a field-separator or newline character, THEN THE Spirit_Box_App SHALL replace each such character with a single space before building the contact text, so that parsing the built text returns the sanitized fields exactly.
5. THE VCard_Builder SHALL build vCard 3.0 text consisting of the lines `BEGIN:VCARD`, `VERSION:3.0`, `FN`, `TEL` (only when the phone is non-empty), `EMAIL` (only when the email is non-empty) and `END:VCARD`, in that order, each line terminated by CRLF.
6. THE VCard_Builder SHALL escape every backslash, comma, semicolon and newline character in each field value as `\\`, `\,`, `\;` and `\n` respectively, following RFC 6350 text escaping.
7. FOR ALL contact field values, THE VCard_Builder SHALL produce output in which the only CR and LF characters are the CRLF line terminators, so that each field value occupies exactly one line.
8. IF the contact name is empty after trimming whitespace, THEN THE Spirit_Box_App SHALL NOT build a Payload, SHALL show an error message stating that a name is required, and SHALL keep the entered phone and email values.
9. IF the built contact text exceeds the Core Payload size limit, THEN THE Spirit_Box_App SHALL NOT start transmission, SHALL show an error message stating the bytes used and the bytes allowed, and SHALL keep the entered field values.
10. IF the text of a received Core `contact` Payload cannot be parsed into a name, THEN THE Spirit_Box_App SHALL show an error message stating the contact could not be read, SHALL NOT offer a vCard download, and SHALL keep the received raw text visible.

### Requirement 7: Byte budget and Byte_Candle

**User Story:** As a sender, I want to see the real packet size against the limit, so that I know whether my message can cross over.

#### Acceptance Criteria

1. WHEN an input changes on the Speak_Screen, THE Spirit_Box_App SHALL compute the Packet_Size by calling Core `encode()` on the current Payload within 100 ms of the change.
2. WHEN Core `encode()` returns a Packet, THE Byte_Candle SHALL show the Packet_Size and `SIZE_CAP` as integers in the form `<size>/<cap> bytes`.
3. WHEN Core `encode()` returns a Packet, THE Byte_Candle SHALL set its fill proportion to Packet_Size divided by `SIZE_CAP`, limited to a maximum of 1.
4. IF Core `encode()` returns a `too-large` error, THEN THE Byte_Candle SHALL show the length reported by Core and the message "Too heavy to cross over (<length>/140 bytes)" in blood red, and SHALL set its fill proportion to 1.
5. IF Core `encode()` returns a `too-large` error, THEN THE Speak_Screen SHALL disable the SCREECH_Key and keep all entered input unchanged.
6. IF Core `encode()` returns an error other than `too-large`, THEN THE Speak_Screen SHALL disable the SCREECH_Key, keep all entered input unchanged, and show a message in plain words that names the field or cause Core reported.
7. IF Core `encode()` returns an error other than `too-large`, THEN THE Byte_Candle SHALL show a fill proportion of 0 and SHALL NOT show a `<size>/<cap> bytes` value.
8. WHILE Core `encode()` returns a Packet of at most `SIZE_CAP` bytes, THE Speak_Screen SHALL enable the SCREECH_Key.
9. THE byte budget function SHALL return Packet_Size, fill proportion and a status of `ok`, `too-large` or `invalid` for a given Core `encode()` result.
10. FOR ALL Payloads, THE byte budget function SHALL return a fill proportion between 0 and 1 inclusive.
11. FOR ALL Payloads for which Core `encode()` succeeds, THE byte budget function SHALL return a Packet_Size equal to the length of the encoded Packet.

### Requirement 8: Hold-to-transmit

**User Story:** As a sender, I want to hold the SCREECH key briefly before sending, so that an accidental tap does not transmit.

#### Acceptance Criteria

1. WHEN the user presses and holds the SCREECH_Key by pointer or touch for the full Hold_Duration (300 ms) and the Audio_Context state is running at that moment, THE Spirit_Box_App SHALL start exactly one transmission at the moment the Hold_Duration elapses, without waiting for release.
2. WHEN the user releases the SCREECH_Key before the Hold_Duration ends, THE Spirit_Box_App SHALL cancel the hold, send nothing, and reset the hold progress fill to 0% within 100 ms.
3. WHEN the user holds the Space key or Enter key for the full Hold_Duration while the SCREECH_Key has focus and the Audio_Context state is running at that moment, THE Spirit_Box_App SHALL start exactly one transmission at the moment the Hold_Duration elapses, the same as a pointer hold.
4. WHEN the user releases the Space key or Enter key before the Hold_Duration ends, THE Spirit_Box_App SHALL cancel the hold, send nothing, and reset the hold progress fill to 0% within 100 ms.
5. WHILE the SCREECH_Key is held and the Hold_Duration has not elapsed, THE Spirit_Box_App SHALL show a hold progress fill whose width equals elapsed hold time divided by the Hold_Duration, from 0% to 100%, updated at least every 50 ms.
6. WHILE the SCREECH_Key is held, THE Spirit_Box_App SHALL ignore repeated keydown events produced by key auto-repeat, so that one press starts at most one hold and at most one transmission.
7. IF the pointer leaves the SCREECH_Key bounds or the pointer or touch is cancelled by the browser during a hold, THEN THE Spirit_Box_App SHALL cancel the hold, send nothing, and reset the hold progress fill to 0%.
8. WHILE the SCREECH_Key is disabled, THE Spirit_Box_App SHALL start no hold, show no hold progress, and start no transmission, for pointer, touch and keyboard input.
9. THE SCREECH_Key SHALL expose an accessible name and an accessible description, and the description SHALL state that the key must be held for 300 ms.
10. THE Hold_State_Machine SHALL be a pure function of its current state and one input event, where the input events are press, release, cancel and elapsed time (in milliseconds), and the outputs are idle, holding with a progress value from 0 to 1, and fired.
11. FOR ALL sequences of hold events, THE Hold_State_Machine SHALL reach the fired state at most once per press, and SHALL return to idle on the next release or cancel after firing.
12. IF the Hold_Duration elapses while the SCREECH_Key is held, THEN THE Spirit_Box_App SHALL set the progress fill to 100% and SHALL show no further hold progress until the next press.
13. IF the Hold_Duration elapses while the Audio_Context state is not running, THEN THE Speak_Screen SHALL show the Wake_Control with the visible text "Tap to wake the box", SHALL NOT fail silently, SHALL send nothing, SHALL keep the entered data unchanged, and SHALL NOT create or resume the Audio_Context from the hold timer.
14. WHEN the user taps the Wake_Control, THE Spirit_Box_App SHALL call unlockAudio synchronously inside that tap handler before any asynchronous wait, and WHEN unlockAudio reports success, THE Spirit_Box_App SHALL start exactly one transmission and remove the Wake_Control.
15. IF unlockAudio fails after the user taps the Wake_Control, THEN THE Speak_Screen SHALL keep the Wake_Control visible, SHALL show the message "Audio could not start. Tap to try again.", and SHALL send nothing.

### Requirement 9: Audio engine

**User Story:** As a developer, I want a UI-independent audio engine, so that the sound logic is testable and the screens stay thin.

#### Acceptance Criteria

1. THE Audio_Engine SHALL reside in `apps/web/src/audio` and import no React module.
2. WHEN the Audio_Engine initialises ggwave, THE Audio_Engine SHALL set `sampleRateInp` and `sampleRateOut` both equal to the Sample_Rate read from the AudioContext, and SHALL set the F32 sample format for input and output.
3. THE Audio_Engine SHALL contain no hardcoded sample-rate value, including 44100 and 48000.
4. WHEN the Audio_Engine sends a Packet, THE Audio_Engine SHALL pass the Packet to ggwave `encode()` as a `Uint8Array`, not as a string.
5. WHEN ggwave `encode()` returns a waveform, THE Audio_Engine SHALL copy it with `.slice()` before using or retaining it.
6. WHEN ggwave `decode()` returns an `Int8Array` view of length greater than 0, THE Audio_Engine SHALL convert it with `new Uint8Array(r.buffer, r.byteOffset, r.length).slice()` before passing the bytes to Core `decode()`.
7. WHEN the Audio_Engine starts listening, THE Audio_Engine SHALL request the microphone with `echoCancellation`, `noiseSuppression` and `autoGainControl` all set to false.
8. WHILE the Audio_Engine is listening, THE Audio_Engine SHALL buffer microphone samples and call ggwave `decode()` with exactly 4096 samples per call.
9. WHERE `AudioWorklet` is supported, THE Audio_Engine SHALL capture microphone samples with an `AudioWorkletNode`.
10. WHERE `AudioWorklet` is not supported, THE Audio_Engine SHALL capture microphone samples with a `ScriptProcessorNode`.
11. WHEN the Audio_Engine sends a Packet, THE Audio_Engine SHALL encode it with the Spirit_Wave protocol.
12. WHEN the Audio_Engine stops listening, THE Audio_Engine SHALL stop every microphone track and disconnect every audio node it created, within 500 ms.
13. IF ggwave fails to load or initialise, THEN THE Audio_Engine SHALL report an error that the Spirit_Box_App shows in plain words stating that the sound engine could not start, SHALL leave send and listen inactive, and SHALL keep the app responsive to taps and navigation.
14. IF the microphone request is denied or no microphone is available, THEN THE Audio_Engine SHALL report an error that the Spirit_Box_App shows in plain words stating that the microphone could not be opened, SHALL create no capture node, and SHALL keep the app responsive.
15. THE sample buffering function SHALL be a pure function that takes incoming sample blocks of any length from 0 to 65536 samples and emits blocks of exactly 4096 samples, in order and without losing or repeating a sample.
16. FOR ALL sequences of input blocks, THE sample buffering function SHALL satisfy: the concatenation of the emitted 4096-sample blocks followed by the remaining buffered samples equals the concatenation of the input blocks (invariant), and the remaining buffered sample count is less than 4096.
17. THE byte conversion function for ggwave decode output SHALL return a `Uint8Array` that holds the same bytes in the same order as the input view and whose `buffer` is not the input view's `buffer`.
18. THE Audio_Engine SHALL define the Transmit_Volume constant in exactly one place, with a default of 50, and SHALL pass it as the volume argument of every ggwave `encode()` call.
19. IF the Transmit_Volume constant is defined with a value outside the integer range 1 to 100, THEN THE Audio_Engine SHALL reject the value at definition time with an error that states the value and the allowed range.

### Requirement 10: Screeching screen

**User Story:** As a sender, I want to see and hear my message going out, so that I know the transmission is real and how far along it is.

#### Acceptance Criteria

1. WHEN a transmission starts, THE Spirit_Box_App SHALL move to the Screeching_Screen within 300 ms and THE Audio_Engine SHALL start playing the encoded waveform through the Audio_Context.
2. WHILE playback is running, THE Oscilloscope SHALL redraw the samples of the outgoing waveform at the current playback position at least 20 times per second.
3. WHILE playback is running, THE Screeching_Screen SHALL show progress as a percentage from 0% to 100% (rounded down to a whole number) equal to elapsed playback time divided by the waveform duration, where elapsed time comes from the Audio_Context clock.
4. WHEN the Screeching_Screen is shown, THE Screeching_Screen SHALL show the duration of the waveform in seconds, rounded to one decimal place.
5. WHEN playback ends, THE Spirit_Box_App SHALL show a transmission-complete message with progress at 100% and a control of at least 44 px by 44 px that returns the user to the Speak_Screen.
6. WHEN the user activates the cancel control during playback, THE Audio_Engine SHALL stop the playback within 100 ms and THE Spirit_Box_App SHALL return to the Speak_Screen with the message the user entered preserved.
7. IF the Audio_Context state is not running when the Hold_Duration elapses, THEN THE Spirit_Box_App SHALL NOT start playback from the hold timer, and SHALL follow the Wake_Control flow in 8.13 to 8.15, in which unlockAudio runs inside the Wake_Control tap handler before playback begins.
8. IF the Audio_Context cannot be resumed or playback fails, THEN THE Screeching_Screen SHALL stop the progress display, show a plain-words message that says the sound did not leave the speaker, and offer a control of at least 44 px by 44 px to return to the Speak_Screen with the message the user entered preserved.
9. THE progress function SHALL return a value between 0 and 1 inclusive for any elapsed time (including negative values) and any duration greater than 0.
10. FOR ALL elapsed times t1 less than or equal to t2, THE progress function SHALL return a value for t1 that is less than or equal to the value for t2 (monotonic property).
11. WHILE Reduced_Motion is active, THE Oscilloscope SHALL show a static snapshot of the full waveform without animation, and THE Screeching_Screen SHALL show the progress as text updated at most once per second.
12. THE Screeching_Screen SHALL show the waveform duration and the remaining seconds when it first appears and at least once per second during playback, with the remaining seconds equal to the waveform duration minus the elapsed playback time from the Audio_Context clock, rounded up to a whole second.
13. WHILE playback is running, THE Screeching_Screen SHALL show a message in a spooky but clear voice that states the sound is still travelling and that the phones must stay close until the sound ends, because a full 140-byte Packet takes about 8 to 9 seconds to send.
14. THE Screeching_Screen SHALL derive every progress value, remaining-seconds value and meter fill from the real playback time of the Audio_Context clock, and SHALL show no simulated or time-based progress that is independent of the playback.

### Requirement 11: Listen screen

**User Story:** As a receiver, I want to see the sound in the room and know when a Screech is arriving, so that I can tell the app is hearing me.

#### Acceptance Criteria

1. WHEN the user opens the Listen_Screen and the microphone is granted, THE Audio_Engine SHALL start capturing microphone samples within 1000 ms of the grant.
2. WHILE the Listen_Screen is open, THE Spectrogram SHALL redraw from frequency data read from an `AnalyserNode` connected to the microphone source at least 10 times per second.
3. WHILE the Listen_Screen is open, THE Spectrogram SHALL highlight the Screech_Band, from 1875 Hz to 6400 Hz inclusive.
4. THE Spectrogram SHALL map each bin index i to the frequency i × Sample_Rate / FFT size, where Sample_Rate is read from the AudioContext and FFT size is the `AnalyserNode` FFT size.
5. WHILE the Listen_Screen is open, THE K_II_Meter SHALL show the mean energy of the bins inside the Screech_Band, normalised to a value between 0 and 1, and update it at least 10 times per second.
6. THE band energy function SHALL be a pure function that takes frequency-bin magnitudes, the Sample_Rate, the FFT size, the band start frequency and the band end frequency, and returns the normalised energy of the bins from the start frequency to the end frequency inclusive.
7. FOR ALL bin magnitude arrays, THE band energy function SHALL return a value between 0 and 1 inclusive.
8. FOR ALL bin magnitude arrays, THE band energy function SHALL return a value that does not change when magnitudes of bins below the band start frequency (1875 Hz) or above the band end frequency (6400 Hz) change.
9. IF the bin magnitude array is empty or no bin lies inside the Screech_Band, THEN THE band energy function SHALL return 0.
10. WHILE the Listen_Screen is open, THE Spirit_Box_App SHALL play no UI_Sound.
11. WHEN the user leaves the Listen_Screen, THE Audio_Engine SHALL stop all microphone tracks and release the microphone within 500 ms.
12. WHILE the Listen_Screen is open, THE Spirit_Box_App SHALL show a text label that states it is listening.
13. WHILE Reduced_Motion is active, THE Spectrogram SHALL update as static frames at no more than 3 frames per second and THE K_II_Meter SHALL show its value as text.
14. IF the microphone stream ends or is revoked while listening, THEN THE Listen_Screen SHALL replace the listening label with a plain-words message that the microphone went silent, stop the Spectrogram updates, and offer a retry control with a touch target of at least 44 px.
15. WHEN the user activates the retry control, THE Audio_Engine SHALL request the microphone again from within that tap handler and, IF access is granted, THEN THE Listen_Screen SHALL resume listening and remove the silent-microphone message.

### Requirement 12: Decode result to screen state

**User Story:** As a receiver, I want noise ignored and real problems explained, so that I only see messages meant for me.

#### Acceptance Criteria

1. WHEN the Audio_Engine produces a byte sequence from ggwave, THE Spirit_Box_App SHALL pass the complete byte sequence, unmodified, to Core `decode()` exactly once.
2. WHEN Core `decode()` returns a decoded Packet that is not multipart, THE Screen_State mapping SHALL return `reveal` with that Packet.
3. IF Core `decode()` returns a Room_Noise_Error, THEN THE Screen_State mapping SHALL return `ignore`, and THE Spirit_Box_App SHALL leave the visible screen unchanged and SHALL NOT add any visible log entry or message.
4. IF Core `decode()` returns `invalid-body`, THEN THE Screen_State mapping SHALL return `garbled`, and THE Spirit_Box_App SHALL show an in-theme garbled-message screen with text stating that the message arrived damaged and a control of at least 44 px height that returns the user to the Listen_Screen.
5. IF Core `decode()` returns `key-required`, THEN THE Screen_State mapping SHALL return `pact-required`, and THE Spirit_Box_App SHALL show the exact text "A sealed message. Join the pact to read it."
6. IF Core `decode()` returns a multipart Packet, THEN THE Screen_State mapping SHALL return `ignore`, because multipart is not interpreted in this release.
7. IF Core `decode()` returns any error code not named in this requirement, THEN THE Screen_State mapping SHALL return `ignore`.
8. THE Screen_State mapping SHALL be a pure function of the Decode_Result, with no dependence on time, prior calls, or external state, and SHALL return the same output for equal inputs.
9. FOR ALL Decode_Results, THE Screen_State mapping SHALL return exactly one of `ignore`, `reveal`, `garbled` or `pact-required`, and SHALL NOT throw.
10. FOR ALL Room_Noise_Error codes, THE Screen_State mapping SHALL return `ignore`.
11. WHEN the Screen_State mapping returns a value other than `ignore`, THE Listen_Screen SHALL stop showing the live capture within 500 ms and THE Spirit_Box_App SHALL show the Reveal_Screen for `reveal`, or the garbled-message screen for `garbled`, or the sealed-message screen for `pact-required`.
12. IF Core `decode()` returns a Packet whose bytes are identical to the Packet shown within the previous 5 seconds, THEN THE Spirit_Box_App SHALL NOT show a second Reveal_Screen for those bytes and SHALL keep the current screen unchanged.
13. IF the same `invalid-body` or `key-required` result is returned again within 5 seconds of showing its screen, THEN THE Spirit_Box_App SHALL NOT show that screen a second time.

### Requirement 13: Reveal screen

**User Story:** As a receiver, I want the message spelled out and an action I can take, so that I can use what I received.

#### Acceptance Criteria

1. WHEN the Spirit_Box_App shows the Reveal_Screen and Reduced_Motion is not active, THE Reveal_Screen SHALL spell the start of the decoded value on the Ouija_Spelling display one character at a time at 12 characters per second (a tolerance of 2 characters per second), spelling at most 30 characters (2.5 seconds in total), and SHALL then show the rest of the value at once. The 3-changes-per-second limit of 2.10 applies to flashing elements and does not apply to this spelling rate.
2. WHILE Reduced_Motion is active, THE Reveal_Screen SHALL show the full decoded value at once, with no character-by-character spelling.
3. WHEN Ouija_Spelling ends, THE Reveal_Screen SHALL show the Action_Card for the Packet type within 500 ms.
4. WHILE Reduced_Motion is active, THE Reveal_Screen SHALL show the Action_Card in the same frame as the full decoded value.
5. THE Reveal_Screen SHALL expose the full decoded value as text to assistive technology from the first rendered frame, and SHALL NOT expose partial spelling states as separate announcements.
6. WHERE the Packet type is text, checkin or hunt-clue, THE Action_Card SHALL show the full decoded text.
7. WHERE the Packet type is url, THE Action_Card SHALL show the full URL and an open control with a touch target of at least 44 px by 44 px.
8. WHEN the user taps the open control for a url Packet, THE Spirit_Box_App SHALL open the URL in a new browsing context with `noopener` and `noreferrer`.
9. THE Spirit_Box_App SHALL open no URL without a user tap, including when the Reveal_Screen is shown, when Ouija_Spelling ends and when the Action_Card appears.
10. IF a received URL uses a scheme other than `http` or `https`, THEN THE Action_Card SHALL show the URL as text, SHALL offer no open control, and SHALL state in plain words that the link type is not safe to open.
11. WHERE the Packet type is wifi, THE Action_Card SHALL show the SSID, the security type, a control to copy the password, and a join QR code, with a touch target of at least 44 px by 44 px on the copy control.
12. WHEN the user taps the copy password control and the clipboard write succeeds, THE Spirit_Box_App SHALL write the password to the clipboard and show a text confirmation that the password was copied.
13. IF the clipboard write fails, THEN THE Action_Card SHALL show the password as selectable text and SHALL state in plain words that copying failed, and the password SHALL remain visible until the user leaves the Reveal_Screen.
14. WHERE the Packet type is wifi and the security is open, THE Action_Card SHALL omit the copy password control.
15. WHERE the Packet type is contact, THE Action_Card SHALL show the name, phone and email, and a control to download a `.vcf` file built by the VCard_Builder, with a touch target of at least 44 px by 44 px.
16. WHERE the Packet type is contact and a field (phone or email) is absent from the Packet, THE Action_Card SHALL omit that field and SHALL NOT show an empty label.
17. WHEN the user taps the download control, THE Spirit_Box_App SHALL download a file with the MIME type `text/vcard`.
18. THE Reveal_Screen SHALL offer a control to return to the Listen_Screen and a control to return to the Speak_Screen, each with a touch target of at least 44 px by 44 px.
19. THE Reveal_Screen SHALL render received text, including SSID, name, phone, email and URL text, as plain text and SHALL NOT interpret it as HTML.
20. WHILE Ouija_Spelling is in progress, THE Reveal_Screen SHALL show a skip control with a touch target of at least 44 px by 44 px, and WHEN the user taps the skip control, THE Reveal_Screen SHALL show the full decoded value and the Action_Card within 100 ms.
21. WHILE Ouija_Spelling is in progress and the skip control has focus, THE Reveal_Screen SHALL treat the Space key and the Enter key as activating the skip control, with the same result as a tap.
22. THE Ouija_Spelling SHALL reveal each character by appending it in a steady colour, and SHALL NOT blink, pulse or toggle the visibility of any element, so that the flashing limit of 2.10 holds.

### Requirement 14: Wi-Fi join QR string

**User Story:** As a receiver, I want a QR code my phone camera can use to join the network, so that I do not type the password.

#### Acceptance Criteria

1. THE Wifi_QR_String builder SHALL map the Core security value `wpa` to `WPA`, `wep` to `WEP` and `open` to `nopass`.
2. THE Wifi_QR_String builder SHALL escape each backslash, semicolon, comma, colon and double quote in the SSID and in the password by prefixing that character with one backslash, and SHALL leave every other character unchanged.
3. THE Wifi_QR_String builder SHALL output the form `WIFI:T:<type>;S:<ssid>;P:<password>;;`, where `<type>` is the mapped value from criterion 1 and `<ssid>` and `<password>` are the escaped values from criterion 2.
4. WHERE the security is open, THE Wifi_QR_String builder SHALL output an empty password field (`P:;`), even when the input contains a password.
5. WHEN the Reveal_Screen shows a received Wi-Fi message, THE Reveal_Screen SHALL render the Wifi_QR_String as a QR code using the `qrcode` package.
6. IF the `qrcode` package throws an error or does not produce a QR code, THEN THE Action_Card SHALL show the SSID, security and password as text, SHALL show a message stating that the QR code could not be drawn, and SHALL keep the received message available for the user.
7. FOR ALL SSIDs and passwords (including empty strings, Unicode text and strings made only of special characters), unescaping the escaped SSID and password fields in the Wifi_QR_String SHALL return the original strings (round-trip property).
8. FOR ALL SSIDs and passwords, THE Wifi_QR_String builder SHALL output a string in which every backslash, semicolon, comma, colon and double quote that comes from the input is preceded by exactly one added backslash.
9. FOR ALL SSIDs and passwords, THE Wifi_QR_String builder SHALL output a string that ends with `;;` and contains exactly three unescaped `;` field terminators before the final `;`, one after each of the `T:`, `S:` and `P:` fields.

### Requirement 15: Navigation and app flow

**User Story:** As a user, I want a clear path between screens, so that I always know where I am.

#### Acceptance Criteria

1. WHEN the Spirit_Box_App starts, THE Spirit_Box_App SHALL show the Awaken_Screen as the only visible screen within 1000 ms of the first render.
2. WHEN the user completes the Awaken_Screen, THE Spirit_Box_App SHALL show the Speak_Screen within 500 ms.
3. THE Speak_Screen SHALL offer one control, with a touch target of at least 44 px by 44 px, that opens the Listen_Screen.
4. THE Listen_Screen SHALL offer one control, with a touch target of at least 44 px by 44 px, that returns to the Speak_Screen.
5. WHILE a transmission is playing, THE Spirit_Box_App SHALL keep the Listen_Screen control on the Speak_Screen disabled and SHALL keep the microphone closed.
6. IF the user attempts to start listening while a transmission is playing, THEN THE Spirit_Box_App SHALL ignore the attempt and show a message stating that listening is unavailable until the transmission ends.
7. WHILE the Listen_Screen is listening, THE Spirit_Box_App SHALL disable every control that starts a transmission and show a message stating that sending is unavailable while listening.
8. WHEN the user leaves the Listen_Screen, THE Spirit_Box_App SHALL stop listening, release the microphone within 500 ms, and re-enable the controls that start a transmission.
9. THE Spirit_Box_App SHALL show the name of the current screen as visible text on each screen.
10. WHEN the browser tab becomes visible again while the Listen_Screen is listening, THE Spirit_Box_App SHALL resume the Audio_Context within 1000 ms, and IF capture has stopped, THEN THE Spirit_Box_App SHALL restart capture without requiring the user to leave the Listen_Screen.
11. IF the Audio_Context cannot be resumed or capture cannot be restarted after the tab becomes visible, THEN THE Spirit_Box_App SHALL show an error message stating that listening stopped and offering a tap control to retry, and SHALL keep any already received data.

### Requirement 16: Platform support

**User Story:** As a user on iPhone or Android, I want the app to work in my browser, so that I can screech to people around me.

#### Acceptance Criteria

1. WHEN the user taps the Awaken control, the Wake_Control, or a control that starts listening, THE Spirit_Box_App SHALL run unlockAudio synchronously inside that tap handler and before any asynchronous wait, creating the Audio_Context if none exists, or calling `resume()` if its state is not running, and SHALL await the `resume()` promise before reading the Audio_Context state or requesting the microphone. A transmission SHALL start when the Hold_Duration elapses only if the Audio_Context state is running at that moment, and otherwise from the Wake_Control tap after unlockAudio reports success, as described in 8.13 to 8.15.
2. THE Spirit_Box_App SHALL create the Audio_Context only inside unlockAudio running in a user gesture handler, and SHALL call `resume()` only inside unlockAudio, inside ensureRunning when called from a Speak_Screen click or keydown handler, or inside a `visibilitychange` handler as described in 15.10, and SHALL NOT create or resume the Audio_Context from the hold timer. IF a resume fails, THEN THE Spirit_Box_App SHALL fall back to the tap-to-retry control described in 15.11.
3. THE Spirit_Box_App SHALL read the Sample_Rate from the Audio_Context at runtime and SHALL NOT hardcode a Sample_Rate value, so that encoding and decoding succeed on devices reporting 44100 Hz and on devices reporting 48000 Hz.
4. WHEN the Spirit_Box_App requests microphone access, THE Spirit_Box_App SHALL turn echoCancellation, noiseSuppression and autoGainControl off in the request.
5. THE Spirit_Box_App SHALL build with the Vite production build and run under the Vite dev server, and SHALL work when served over HTTPS in the latest stable releases of Safari on iOS, Chrome on Android and Chrome on desktop.
6. WHERE `AudioContext` is not defined and `webkitAudioContext` is defined, THE Spirit_Box_App SHALL use `webkitAudioContext` to create the Audio_Context.
7. IF the browser lacks WebAssembly, Web Audio, or a secure context (HTTPS) needed for microphone access, THEN THE Spirit_Box_App SHALL show an in-theme message within 1 second of load that names each missing feature, disable the send and listen controls, and keep the message visible until the page is reloaded.
8. THE Spirit_Box_App SHALL compile with `tsc` in strict mode with zero errors, and the source SHALL contain zero occurrences of the `any` type.
9. WHEN a click or keydown event reaches a handler on the Speak_Screen (Tarot_Cards, inputs, seal toggle, Listen control, and SCREECH_Key keys), THE Spirit_Box_App SHALL call ensureRunning before that handler's own work, without awaiting its result.

### Requirement 17: Test coverage of pure logic

**User Story:** As a developer, I want the pure logic fully tested, so that the thin audio and UI layers rest on proven functions.

#### Acceptance Criteria

1. THE Spirit_Box_App SHALL have, for the Wifi_QR_String builder, at least one unit test per documented input class (open network, WPA network, WEP network, and an SSID or password containing each escaped character) and at least one fast-check property test that runs at least 100 generated cases.
2. THE Spirit_Box_App SHALL have, for the VCard_Builder and for the contact text build function and the contact text parse function, at least one unit test per documented input class (name only, name with each optional field, empty field, field at maximum length) and fast-check property tests that run at least 100 generated cases each, including a property that parsing the output of the build function returns the original contact.
3. THE Spirit_Box_App SHALL have, for the byte budget function, unit tests at the boundary values (0 bytes, one byte below the limit, exactly the limit, one byte over the limit) and a fast-check property test that runs at least 100 generated cases and checks that the reported Packet_Size equals the length of the Packet from Core `encode()`.
4. THE Spirit_Box_App SHALL have, for the Screen_State mapping, a unit test for every defined Screen_State and a fast-check property test that runs at least 100 generated cases and checks that every generated input maps to exactly one defined Screen_State.
5. THE Spirit_Box_App SHALL have, for each of the sample buffering function, the ggwave byte conversion function, the band energy function, the progress function and the Hold_State_Machine, at least one unit test per documented input class (including empty input and boundary values) and at least one fast-check property test that runs at least 100 generated cases.
6. THE Spirit_Box_App SHALL have a fast-check property test for the Hold_State_Machine that checks that, for any generated sequence of events, the machine ends in one defined state and never takes a transition outside the documented transition table.
7. THE Spirit_Box_App SHALL keep the functions named in criteria 1 to 5 in modules whose import graph includes neither React nor any browser audio API.
8. IF a test run finds that a module named in criterion 7 imports React or a browser audio API, THEN THE Spirit_Box_App SHALL fail the `pnpm test` run and report the offending module.

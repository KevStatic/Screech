# Requirements Document

## Introduction

Haunting Sounds adds procedural horror atmosphere to the Spirit_Box_App in `apps/web`, in the style of Phasmophobia, with no audio files. Every sound is computed at runtime by a pure function that returns a `Float32Array` for a given sample rate, then played through an `AudioBuffer`. This keeps every sound testable in Node.

The sounds are:

- Awaken: a CRT power-on thunk, a rising low hum and low boot ticks.
- Speak: a loopable faint room drone, a card-flip swish on Tarot_Card selection and a soft candle crackle.
- Reveal: a planchette scrape for each spelled letter, then a breathy whisper when the spelling ends.
- Garbled: a broken radio crackle.
- Sealed: a low, heavy thud.

Four rules shape the design. First, every sound stays below 1800 Hz so that it can never overlap the Screech_Band (1875 Hz to 6400 Hz), and a property test proves it at 44100 Hz and 48000 Hz. Second, most of each sound's energy lies in the Phone_Band (300 Hz to 1500 Hz), because phone speakers reproduce little below about 300 Hz to 500 Hz. The sounds keep a low feel through harmonics that make the ear hear the low pitch (the missing-fundamental effect). Third, every sound is silent while the app is listening or transmitting, so that Haunting Sounds never disturb a Packet. Fourth, every sound has a gentle attack and a peak level well below the Transmit_Volume, so that no sound is a jump scare.

On iOS, the silent switch can mute Web Audio and the page cannot detect it. The Spirit_Box_App therefore shows a one-time hint about the switch.

Haunting Sounds extend the `UI_Sound` term of the existing `spirit-box-app` spec. They obey its rule that no UI_Sound plays on the Listen_Screen, and they use its Audio_Context, `unlockAudio` and `ensureRunning` unchanged.

### Assumptions

The brief is ambiguous in the following places. These requirements resolve each one as follows, and the design phase may refine them.

1. **Awaken timing.** The Awaken sounds play once, starting at the Awaken tap that calls `unlockAudio`, and they stop early if a Quiet_State begins. The brief does not say whether the tap leads to the Speak_Screen or the Listen_Screen. When it leads to the Listen_Screen, the Quiet_State rule cuts the Awaken sounds.
2. **Drone scope.** The room drone plays only while the Speak_Screen is open. The Reveal, Garbled and Sealed screens play only their own one-shot sounds.
3. **Candle crackle trigger.** The brief names no trigger for the soft candle crackle. It plays when the Byte_Candle value changes, so that the sound reflects real state, and it is limited to one crackle per 400 ms.
4. **Skipping the spelling.** When the user skips the Ouija_Spelling, the remaining scrapes are not played, and the whisper plays once as the reveal completes.
5. **Reduced motion and spelling.** Exorcise does not change the sound. When the spelling is shown without per-letter steps, no scrape plays for a letter that was not stepped, and the whisper still plays at the end.
   The Ouija_Spelling steps through at most SPELL_MAX_CHARS characters one by one (the constant in `apps/web/src/logic/ouija.ts`, currently 30) and shows the rest at once. Scrapes therefore stop after SPELL_MAX_CHARS letters.
6. **"Negligible energy".** The energy above 1800 Hz must be at most 0.0001 (minus 40 dB) of the total energy of the sound, measured with a Hann-windowed FFT. The 75 Hz gap between 1800 Hz and the 1875 Hz band start is the guard band. The Phone_Band does not change this ceiling. Sine partials stop at the Partial_Limit (1400 Hz), and a sine has no energy above the Haunt_Ceiling.
7. **"Well below the transmission volume".** Every sound has a peak amplitude of at most 0.2 (about minus 14 dBFS) before the playback gain. The playback gain never exceeds 1.0. The Transmit_Volume constant of 50 produces a louder waveform than this limit, which the design phase confirms by measurement.
8. **"Gentle attack".** Every sound starts at amplitude 0 and takes at least 30 ms to reach its peak. Every sound ends at amplitude 0 so that no click occurs at the end.
9. **Supported sample rates.** The synthesis functions accept integer sample rates from 22050 Hz to 96000 Hz. The property tests run at 44100 Hz and 48000 Hz, the rates Safari and Chrome commonly use.
10. **Storage key and default.** The Sound_Toggle is saved under the `localStorage` key `screech.sound`. A missing, unreadable or unrecognised value means on.
11. **Phone speakers.** Phone speakers reproduce little below about 300 Hz to 500 Hz, so a sound with its energy at 62 Hz to 330 Hz would be nearly silent on a phone. Each sound keeps a low character by putting its energy in the Phone_Band and adding harmonics of the low pitch. Drone partials go up to about 880 Hz, and thud and hum harmonics go up to about 1100 Hz. Noise is shaped by an 8th-order low-pass with a corner of at most 800 Hz, or by a steeper filter if a higher corner is needed to meet the Out_Of_Band_Limit.
12. **Phone_Band_Share figure.** "Most of the energy" is fixed at a Phone_Band_Share of at least 0.5, measured with the same Hann-windowed FFT as the Out_Of_Band_Ratio.
13. **Silent switch hint.** The hint about the iOS silent switch appears once per install after the Awaken_Tap on iOS. It never plays a sound and never blocks the user.

## Glossary

- **Spirit_Box_App**: The React web app in `apps/web`.
- **Haunt_Synth**: The pure module in `apps/web/src/logic` that contains every Sound_Generator. It contains no React code and no Web Audio API calls.
- **Haunt_Player**: The module in `apps/web/src/audio` that turns Sound_Generator output into `AudioBuffer` objects, plays them through the Audio_Context and applies the Quiet_State and Sound_Toggle rules. It contains no React code.
- **Sound_Generator**: A pure function in the Haunt_Synth that takes a sample rate (and, where stated, a seed or parameters) and returns a mono `Float32Array`.
- **Sound_Name**: One of `awaken`, `drone`, `card-flip`, `candle-crackle`, `planchette-scrape`, `whisper`, `broken-crackle` or `sealed-thud`.
- **Awaken_Sound**: The sound for the Sound_Name `awaken`, made of a CRT power-on thunk, a rising low hum and low boot ticks.
- **Drone**: The sound for the Sound_Name `drone`, a faint loopable room tone.
- **Card_Flip**: The sound for the Sound_Name `card-flip`, a soft swish.
- **Candle_Crackle**: The sound for the Sound_Name `candle-crackle`, a soft crackle.
- **Planchette_Scrape**: The sound for the Sound_Name `planchette-scrape`, a short wooden scrape.
- **Whisper**: The sound for the Sound_Name `whisper`, a breathy whisper.
- **Broken_Crackle**: The sound for the Sound_Name `broken-crackle`, a broken radio crackle.
- **Sealed_Thud**: The sound for the Sound_Name `sealed-thud`, a low, heavy thud.
- **One_Shot**: Any sound other than the Drone. A One_Shot plays once and ends.
- **Sample_Rate**: `Audio_Context.sampleRate`, read at runtime and never hardcoded.
- **Audio_Context**: The browser `AudioContext` created or resumed by the existing `unlockAudio` function.
- **Screech_Band**: The frequency range from 1875 Hz to 6400 Hz inclusive, the range of the ggwave tones.
- **Haunt_Ceiling**: 1800 Hz, the highest frequency at which a Sound_Generator may put energy. It stays at 1800 Hz and is independent of the Partial_Limit and the Phone_Band.
- **Phone_Band**: The frequency range from 300 Hz to 1500 Hz inclusive, where phone speakers reproduce sound well and which lies below the Haunt_Ceiling.
- **Phone_Band_Share**: For one generated sound, the sum of the squared FFT magnitudes of the bins from 300 Hz to 1500 Hz, divided by the sum of the squared FFT magnitudes of all bins. The FFT uses a Hann window and zero-pads the sound to the next power of two.
- **Phone_Band_Minimum**: 0.5, the smallest allowed Phone_Band_Share.
- **Partial_Limit**: 1400 Hz, the highest frequency of any pure sine partial in a Sound_Generator.
- **Missing_Fundamental**: The effect by which the ear perceives a low pitch from its harmonics even when the speaker cannot reproduce the low pitch itself.
- **Out_Of_Band_Ratio**: For one generated sound, the sum of the squared FFT magnitudes of all bins above the Haunt_Ceiling, divided by the sum of the squared FFT magnitudes of all bins. The FFT uses a Hann window and zero-pads the sound to the next power of two.
- **Out_Of_Band_Limit**: 0.0001, the largest allowed Out_Of_Band_Ratio.
- **Haunt_Peak_Limit**: 0.2, the largest allowed absolute sample value of any generated sound.
- **Attack_Time**: The time, in milliseconds, from the first sample to the first sample whose absolute value reaches 90 percent of the sound's peak.
- **Min_Attack_Time**: 30 ms.
- **Transmit_Volume**: The existing constant in `apps/web/src/audio/constants.ts` that sets the ggwave encode volume.
- **Quiet_State**: The state in which the Spirit_Box_App is listening or transmitting. It is true WHILE the Listen_Screen is open, a microphone capture is active, the Screeching_Screen is open or a Packet playback is running.
- **Quiet_Fade_Limit**: 200 ms, the longest time a running sound may take to reach silence after a Quiet_State begins or the Sound_Toggle turns off.
- **Sound_Toggle**: The in-theme switch labelled "Sound: on" or "Sound: off" that turns Haunting Sounds on or off.
- **Sound_Preference**: The saved on/off value of the Sound_Toggle.
- **Sound_Key**: The `localStorage` key `screech.sound` that holds the Sound_Preference.
- **Exorcise_Toggle**: The existing control that turns all motion off. Its state is saved in `localStorage`.
- **Awaken_Tap**: The user's tap on the Awaken_Screen control that calls `unlockAudio`.
- **Sound_Gate**: The Haunt_Player condition that allows a sound to start. It is true only when the Awaken_Tap has happened, the Audio_Context is running, the Sound_Preference is on and the Quiet_State is false.
- **Awaken_Screen**, **Speak_Screen**, **Listen_Screen**, **Screeching_Screen**, **Reveal_Screen**, **Garbled_Screen**, **Sealed_Screen**: The screens of the Spirit_Box_App defined in the `spirit-box-app` spec.
- **Tarot_Card**: A selectable card for one send type on the Speak_Screen.
- **Byte_Candle**: The gauge on the Speak_Screen that shows the Packet size against its cap.
- **Ouija_Spelling**: The letter-by-letter reveal of the decoded value on the Reveal_Screen.
- **Letter**: Any single non-whitespace character that the Ouija_Spelling reveals, including digits and punctuation. The Reveal_Screen also spells URLs and SSIDs, so a Letter is not limited to alphabetic characters.
- **Spell_Max_Chars**: The existing constant `SPELL_MAX_CHARS` in `apps/web/src/logic/ouija.ts`, currently 30, the largest number of characters that the Ouija_Spelling reveals one by one. The remainder is shown at once, with no per-Letter scrape.
- **iOS_Device**: A device whose user agent names iPhone, iPad or iPod, or whose `navigator.platform` is `MacIntel` and whose maximum touch points is greater than 1 (an iPad in Safari desktop mode). A device with platform `MacIntel` and a maximum touch points of 1 or less is a real Mac and is not an iOS_Device.
- **Sound_Hint**: The one-time message "On iPhone, the silent switch mutes these sounds."
- **Sound_Hint_Key**: The `localStorage` key `screech.sound-hint` that records that the Sound_Hint was shown.
- **Packet**: A byte sequence sent or received as a Screech transmission.
- **Seed**: An integer that makes a Sound_Generator output reproducible.

## Requirements

### Requirement 1: Pure sound generators

**User Story:** As a developer, I want every sound produced by a pure function, so that the sounds are testable in Node and need no audio files.

#### Acceptance Criteria

1. THE Haunt_Synth SHALL provide exactly one Sound_Generator for each Sound_Name, and each Sound_Generator SHALL accept a Sample_Rate and, for every One_Shot, a Seed.
2. WHEN a Sound_Generator is called with an integer Sample_Rate from 22050 to 96000, THE Sound_Generator SHALL return a `Float32Array` whose length is greater than 0.
3. THE Haunt_Synth SHALL contain no Web Audio API calls, no DOM access, no `Math.random`, no `Date` reads and no audio file imports.
4. WHEN a Sound_Generator is called twice with the same Sample_Rate and Seed, THE Sound_Generator SHALL return two arrays with identical length and bit-identical sample values.
5. WHEN a One_Shot Sound_Generator is called with two different integer Seeds and the same Sample_Rate, THE Sound_Generator SHALL return arrays that differ in at least one sample.
6. FOR ALL integer Sample_Rates from 22050 to 96000 and all integer Seeds, THE Sound_Generator SHALL return only finite sample values (no `NaN`, no `Infinity`) in the inclusive range -1 to 1.
7. FOR ALL integer Sample_Rates from 22050 to 96000 and all integer Seeds, THE duration of each generated sound (array length divided by Sample_Rate) SHALL be from 0.15 s to 3.0 s inclusive for a One_Shot and from 2.0 s to 8.0 s inclusive for the Drone.
8. IF a Sound_Generator is called with a Sample_Rate that is not an integer from 22050 to 96000 (including `NaN`, `Infinity`, non-integers, zero and negative numbers), THEN THE Sound_Generator SHALL throw a `RangeError` whose message contains the received value and the text of the allowed range, and SHALL return no array.
9. THE Haunt_Synth SHALL give the Awaken_Sound three audible parts in time order: a power-on thunk, then a rising low hum whose dominant frequency in the last 100 ms of the hum is higher than in its first 100 ms, then at least three boot ticks, each separated from the next by at least 20 ms of samples whose absolute value is below 5 percent of the tick's peak.
10. THE Haunt_Synth SHALL generate the Whisper as filtered noise, so that no single 10 Hz-wide frequency band holds more than 50 percent of the Whisper's total spectral energy.

### Requirement 2: Spectral limit below the Screech_Band

**User Story:** As a user, I want the haunting sounds to stay out of the Screech_Band, so that they can never disturb a transmission or a reception.

#### Acceptance Criteria

1. FOR ALL Sound_Names, THE Haunt_Synth SHALL generate a sound whose Out_Of_Band_Ratio is at most the Out_Of_Band_Limit (0.0001) at a Sample_Rate of 44100 Hz.
2. FOR ALL Sound_Names, THE Haunt_Synth SHALL generate a sound whose Out_Of_Band_Ratio is at most the Out_Of_Band_Limit (0.0001) at a Sample_Rate of 48000 Hz.
3. FOR ALL Seeds in the range 0 to 4294967295, THE Haunt_Synth SHALL generate every seeded One_Shot with an Out_Of_Band_Ratio of at most the Out_Of_Band_Limit (0.0001) at 44100 Hz and at 48000 Hz.
4. FOR ALL generated sounds, THE energy inside the Screech_Band (1875 Hz to 6400 Hz), measured as the sum of squared FFT magnitudes of the bins in that range divided by the sum over all bins, SHALL be at most the Out_Of_Band_Limit (0.0001).
5. THE Haunt_Synth SHALL export the Haunt_Ceiling as a named constant with the value 1800 (Hz), and THE property tests SHALL read the Haunt_Ceiling from that constant and not from a literal.
6. THE property tests SHALL measure the Out_Of_Band_Ratio as the sum of squared FFT magnitudes of bins above the Haunt_Ceiling divided by the sum over all bins, using a Hann window and zero-padding to the next power of two, with an FFT helper that lives in the test code and is absent from the shipped bundle.
7. THE property tests SHALL express the Out_Of_Band_Ratio check as a fast-check property that runs at least 100 generated cases per property.
8. IF a generated sound has an Out_Of_Band_Ratio above the Out_Of_Band_Limit, THEN THE property test SHALL fail and SHALL report the Sound_Name, the Sample_Rate in Hz, the Seed and the measured ratio.
9. THE Haunt_Synth SHALL keep the Haunt_Ceiling at 1800 Hz, and THE Out_Of_Band_Limit SHALL stay 0.0001 after the Phone_Band change, so that the checks in criteria 1 to 4 apply unchanged to the phone-audible sounds.
10. THE Haunt_Synth SHALL generate every sound so that its Phone_Band_Share is at least the Phone_Band_Minimum (0.5) at a Sample_Rate of 44100 Hz and at 48000 Hz.
11. FOR ALL Seeds in the range 0 to 4294967295, THE Haunt_Synth SHALL generate every seeded One_Shot with a Phone_Band_Share of at least the Phone_Band_Minimum (0.5) at 44100 Hz and at 48000 Hz.
12. THE Haunt_Synth SHALL export the Partial_Limit as a named constant with the value 1400 (Hz), and THE Haunt_Synth SHALL use no pure sine partial with a frequency above the Partial_Limit in any Sound_Generator.
13. THE Haunt_Synth SHALL give the Drone sine partials with frequencies up to 880 Hz, and SHALL give the Sealed_Thud and the hum of the Awaken_Sound harmonics up to 1100 Hz, so that their low pitch is perceived through the Missing_Fundamental effect.
14. THE Haunt_Synth SHALL shape every noise component with an 8th-order low-pass filter whose corner is at most 800 Hz, or with a steeper filter, so that the Out_Of_Band_Ratio stays at most the Out_Of_Band_Limit.
15. THE property tests SHALL read the Phone_Band bounds, the Phone_Band_Minimum and the Partial_Limit from named constants and not from literals, and SHALL run each Phone_Band_Share property for at least 100 generated cases.
16. IF a generated sound has a Phone_Band_Share below the Phone_Band_Minimum, THEN THE property test SHALL fail and SHALL report the Sound_Name, the Sample_Rate in Hz, the Seed and the measured share.

### Requirement 3: Gentle attack and low level

**User Story:** As a listener, I want every sound to start softly and stay quiet, so that nothing startles me or drowns out a transmission.

#### Acceptance Criteria

1. THE Haunt_Synth SHALL generate every sound so that the absolute value of its first sample equals 0.
2. THE Haunt_Synth SHALL generate every sound so that the absolute value of its last sample equals 0.
3. THE Haunt_Synth SHALL generate every sound so that the largest absolute sample value is at most the Haunt_Peak_Limit (0.2 on a full-scale range of -1.0 to 1.0).
4. THE Haunt_Synth SHALL generate every sound so that its Attack_Time, measured in milliseconds from the first sample to the first sample whose absolute value reaches 90 percent of the sound's peak, is at least the Min_Attack_Time (30 ms).
5. THE Haunt_Synth SHALL generate every sound so that the largest absolute difference between two consecutive samples is at most 0.05.
6. WHEN the Haunt_Player plays a sound, THE Haunt_Player SHALL route the sound through a gain stage whose gain value is between 0 and 1.0 inclusive at every moment of playback.
7. THE Haunt_Peak_Limit SHALL be strictly less than the peak amplitude of a Packet waveform encoded at the Transmit_Volume, and a unit test SHALL assert that relationship.
8. WHEN the Haunt_Player starts the Drone, THE Haunt_Player SHALL ramp the Drone gain from 0 to the Drone level over a period of at least 500 ms.
9. THE Haunt_Synth SHALL generate the Drone so that the absolute value of every Drone sample is below 0.1 (0.5 times the Haunt_Peak_Limit), so that the Drone is fainter than every One_Shot.
10. IF a generated sound violates any of criteria 1 to 5 or 9, THEN THE Haunt_Player SHALL refuse to play that sound and SHALL leave the currently playing audio unchanged.

### Requirement 4: Seamless drone loop

**User Story:** As a user on the Speak_Screen, I want the room drone to loop without a click or a gap, so that the atmosphere stays steady.

#### Acceptance Criteria

1. WHEN the Drone generator is called with a Sample_Rate from 22050 Hz to 96000 Hz inclusive, THE Drone generator SHALL return a buffer whose first sample and last sample are both exactly 0, as required by Requirement 3.
2. WHEN the Drone generator is called with a Sample_Rate from 22050 Hz to 96000 Hz inclusive, THE Drone generator SHALL return a buffer in which the absolute difference between the last sample and the first sample is at most the largest absolute difference between two consecutive samples inside the buffer.
3. IF the Drone generator is called with a Sample_Rate below 22050 Hz or above 96000 Hz, THEN THE Drone generator SHALL reject the call with an error indicating the Sample_Rate is outside the supported range, and SHALL return no buffer.
4. WHEN the Haunt_Player starts the Drone, THE Haunt_Player SHALL set the `loop` flag of the buffer source to true and SHALL NOT restart the source for each repetition.
5. WHILE the Speak_Screen is open and the Sound_Gate is true, THE Haunt_Player SHALL play the Drone in a loop.
6. WHEN the user leaves the Speak_Screen, THE Haunt_Player SHALL fade the Drone to silence within the Quiet_Fade_Limit of 200 ms and SHALL then stop and release the source.
7. WHEN a second request to start the Drone arrives while the Drone is already playing, THE Haunt_Player SHALL keep the existing source and SHALL NOT start a second one.

### Requirement 5: Silence while listening or transmitting

**User Story:** As a sender and receiver, I want the app to stay silent while it listens or transmits, so that haunting sounds never interfere with a Packet.

#### Acceptance Criteria

1. WHILE the Quiet_State is true, THE Haunt_Player SHALL start no sound, and SHALL ignore each sound request received during that time without queuing it.
2. WHEN the Quiet_State becomes true, THE Haunt_Player SHALL begin the fade within 50 ms, using a gain ramp on the Audio_Context clock, and SHALL bring every running sound, including the Drone, to zero gain within the Quiet_Fade_Limit (200 ms) measured from the moment the Quiet_State becomes true.
3. WHEN the fade started by criterion 2 completes, THE Haunt_Player SHALL stop the audio sources of every sound that was running, so that zero sources remain active.
4. WHEN the Quiet_State becomes true, THE Haunt_Player SHALL discard every sound request that is waiting to start, and SHALL not play any discarded request after the Quiet_State becomes false.
5. WHEN the Quiet_State becomes false, the Speak_Screen is open and the Sound_Gate is true, THE Haunt_Player SHALL restart the Drone with the Requirement 3.8 ramp.
6. WHILE the Listen_Screen is open, THE Spirit_Box_App SHALL play no Haunting Sound, in line with the `spirit-box-app` rule that no UI_Sound plays there.
7. WHILE a Packet playback is running on the Screeching_Screen, THE Spirit_Box_App SHALL play no Haunting Sound.
8. THE Haunt_Player SHALL expose the Quiet_State as a pure function of the current screen, the capture state and the playback state, with no side effects and the same output for the same inputs.
9. THE test suite SHALL include a fast-check property test asserting that the Quiet_State function returns true for every combination of screen, capture state and playback state in which the Listen_Screen is open, a mic capture is active, the Screeching_Screen is open, or a Packet playback is running, and returns false for every other combination.

### Requirement 6: Sound start rules and the Awaken_Tap

**User Story:** As a user on iOS Safari or Chrome, I want sounds to start only after I tap, so that the browser allows audio and I am never surprised.

#### Acceptance Criteria

1. WHILE the Awaken_Tap has not happened, THE Haunt_Player SHALL start no sound and SHALL create no Audio_Context.
2. WHEN the Awaken_Tap happens, THE Spirit_Box_App SHALL create or resume the Audio_Context by calling `unlockAudio` synchronously inside the tap handler, before any `await` in that handler.
3. WHEN `unlockAudio` has completed and the Sound_Gate is true, THE Haunt_Player SHALL play the Awaken_Sound exactly once for that Awaken_Tap.
4. WHEN a sound is requested, THE Haunt_Player SHALL play it only if the Sound_Gate is true at the moment of the request, and otherwise SHALL start no sound and SHALL show no error notice.
5. THE Haunt_Player SHALL read the Sample_Rate from the Audio_Context for every generator call and SHALL contain no sample rate constant.
6. THE Haunt_Player SHALL key its `AudioBuffer` cache by Sound_Name, Sample_Rate and Seed, SHALL generate each such key at most once, and SHALL reuse the cached `AudioBuffer` for every later play with the same key. Each letter index has its own Seed, and therefore its own buffer.
7. IF `unlockAudio` reports that the Audio_Context is not running, THEN THE Haunt_Player SHALL start no sound, SHALL not throw, and SHALL show no error notice. The Sound_Gate remains false until the Audio_Context is running.
8. IF a Sound_Generator or the `AudioBuffer` creation throws, THEN THE Haunt_Player SHALL catch the error, SHALL skip that sound, SHALL leave every other app function unchanged, SHALL not cache a result for that Sound_Name, Sample_Rate and Seed, and SHALL show the notice "The spirits are silent. This sound could not be made." on the first failure in a session and on no later failure in that session.
9. THE Haunt_Player SHALL create no second Audio_Context and SHALL use the Audio_Context returned by the existing session module.
10. WHEN a One_Shot ends, THE Haunt_Player SHALL disconnect its source node and its gain node within 100 ms of the end event.
11. WHEN a One_Shot is requested less than 30 ms after the previous accepted request with the same Sound_Name, THE Haunt_Player SHALL ignore the new request, so that at most one One_Shot per Sound_Name starts in any 30 ms window and rapid taps never stack into a louder sound. A request with a different Sound_Name is not ignored by this rule.

### Requirement 7: Sounds on the Awaken and Speak screens

**User Story:** As a user, I want the boot and the card table to sound alive, so that the app feels like an old haunted radio.

#### Acceptance Criteria

1. WHEN the Awaken_Tap happens and the Sound_Gate is true, THE Haunt_Player SHALL play the Awaken_Sound once, with a duration between 1.5 s and 3.0 s, as stated in Requirement 6.3.
2. IF the Sound_Gate is false when the Awaken_Tap happens, THEN THE Haunt_Player SHALL play no Awaken_Sound and THE Awaken_Screen SHALL remain fully usable.
3. WHEN the user selects a Tarot_Card that is not currently selected and the Sound_Gate is true, THE Haunt_Player SHALL play the Card_Flip exactly once, with a duration between 0.15 s and 0.5 s.
4. WHEN the user selects the Tarot_Card that is already selected, THE Haunt_Player SHALL play no Card_Flip.
5. WHEN the Byte_Candle value changes and the Sound_Gate is true, THE Haunt_Player SHALL play one Candle_Crackle with a duration between 0.15 s and 0.6 s, unless a Candle_Crackle started less than 400 ms earlier, in which case THE Haunt_Player SHALL play no additional Candle_Crackle.
6. WHEN the Byte_Candle value stays the same, THE Haunt_Player SHALL play no Candle_Crackle.
7. WHILE the Speak_Screen is open and the Sound_Gate is true, THE Haunt_Player SHALL play the Drone as stated in Requirement 4.
8. IF the Sound_Gate becomes false while a Card_Flip, Candle_Crackle or Awaken_Sound is playing, THEN THE Haunt_Player SHALL bring that sound to silence within the Quiet_Fade_Limit and SHALL start no new sound until the Sound_Gate is true again.

### Requirement 8: Sounds on the Reveal, Garbled and Sealed screens

**User Story:** As a receiver, I want the revealed message, a damaged message and a sealed message to each have their own sound, so that I can tell the outcomes apart by ear.

#### Acceptance Criteria

1. WHEN the Ouija_Spelling reveals one of its first Spell_Max_Chars Letters one by one and the Sound_Gate is true, THE Haunt_Player SHALL start exactly one Planchette_Scrape within 50 ms of that Letter becoming visible.
2. WHEN the Ouija_Spelling reveals whitespace, THE Haunt_Player SHALL start no Planchette_Scrape for that whitespace.
3. WHEN the Ouija_Spelling reveals its last character, including the remainder shown at once after Spell_Max_Chars characters, and the Sound_Gate is true, THE Haunt_Player SHALL start the Whisper exactly once within 100 ms of that reveal.
4. WHEN the user skips the Ouija_Spelling, THE Haunt_Player SHALL start no further Planchette_Scrape, SHALL stop any running Planchette_Scrape within 100 ms, and, IF the Sound_Gate is true, SHALL start the Whisper exactly once.
5. THE Haunt_Player SHALL pass the Planchette_Scrape generator a Seed derived only from the Letter index (0-based, counting Letters only, so that whitespace never shifts the index), so that two letters with different indexes produce different audio samples and the same index always produces identical audio samples.
6. FOR ALL spelled strings of n Letters (0 ≤ n ≤ 100, whitespace allowed, any non-whitespace character counting as a Letter) that the Ouija_Spelling reveals to the end without a skip while the Sound_Gate is true, THE Haunt_Player SHALL start exactly min(n, Spell_Max_Chars) Planchette_Scrapes and exactly one Whisper. The Letters beyond Spell_Max_Chars are shown at once and get no scrape.
7. WHEN the Garbled_Screen opens and the Sound_Gate is true, THE Haunt_Player SHALL start the Broken_Crackle exactly once within 100 ms of the screen appearing.
8. WHEN the Sealed_Screen opens and the Sound_Gate is true, THE Haunt_Player SHALL start the Sealed_Thud exactly once within 100 ms of the screen appearing.
9. THE Haunt_Synth SHALL produce a Planchette_Scrape lasting 0.15 s to 0.5 s, a Whisper lasting 0.8 s to 2.0 s, a Broken_Crackle lasting 0.4 s to 1.2 s, and a Sealed_Thud lasting 0.4 s to 1.5 s, each measured from the first sample to the last sample.
10. WHEN the user returns to the Listen_Screen from the Reveal, Garbled or Sealed screen, THE Haunt_Player SHALL bring every sound from those screens to silence within the Quiet_Fade_Limit and SHALL apply the Quiet_State rules of Requirement 5.
11. IF the Sound_Gate is false, THEN THE Haunt_Player SHALL start no Planchette_Scrape, Whisper, Broken_Crackle or Sealed_Thud, and THE Ouija_Spelling, Garbled_Screen and Sealed_Screen SHALL still show their visual content unchanged.

### Requirement 9: Sound toggle

**User Story:** As a user, I want a visible switch to turn the haunting sounds off, so that I can use the app quietly.

#### Acceptance Criteria

1. THE Spirit_Box_App SHALL render exactly one Sound_Toggle, placed directly adjacent to the Exorcise_Toggle, on every screen that renders the Exorcise_Toggle.
2. WHILE the Sound_Preference is on, THE Sound_Toggle SHALL show the visible text "Sound: on". WHILE the Sound_Preference is off, THE Sound_Toggle SHALL show the visible text "Sound: off".
3. THE Sound_Toggle SHALL use `role="switch"`. WHILE the Sound_Preference is on, THE Sound_Toggle SHALL set `aria-checked` to `true`. WHILE the Sound_Preference is off, THE Sound_Toggle SHALL set `aria-checked` to `false`.
4. THE Sound_Toggle SHALL have a touch target of at least 44 px by 44 px, SHALL have a text contrast ratio of at least 4.5:1 against its background in both states, and SHALL contain no emoji.
5. WHEN the Spirit_Box_App starts and no value is saved under the Sound_Key, THE Spirit_Box_App SHALL set the Sound_Preference to on and SHALL NOT write to the Sound_Key.
6. WHEN the user activates the Sound_Toggle by tap, click, Enter key or Space key, THE Spirit_Box_App SHALL flip the Sound_Preference, SHALL save it under the Sound_Key as `1` for on or `0` for off, and SHALL update the label and `aria-checked` within 100 ms.
7. WHEN the Spirit_Box_App starts, THE Spirit_Box_App SHALL read the Sound_Key and SHALL set the Sound_Preference to off only when the saved value is exactly the string `0`. Any other saved value, including an empty string, `false` and `off`, SHALL set the Sound_Preference to on.
8. IF `localStorage` is unavailable or throws on read or write, THEN THE Spirit_Box_App SHALL keep the Sound_Preference in memory for the rest of the session, SHALL set it to on when the read fails, SHALL apply each toggle change in memory even when the write fails, SHALL show no error dialog, and SHALL continue to work.
9. WHEN the Sound_Preference changes to off, THE Haunt_Player SHALL bring every running sound to silence within the Quiet_Fade_Limit, SHALL discard every waiting sound request, and SHALL start no new sound while the Sound_Preference is off.
10. WHEN the Sound_Preference changes to on and the Speak_Screen is open and the Sound_Gate is true, THE Haunt_Player SHALL start the Drone with the Requirement 3.8 ramp.
11. WHILE the Awaken_Tap has not happened, THE Sound_Toggle SHALL remain operable, SHALL change only the saved Sound_Preference, and SHALL play no sound and create no Audio_Context.
12. THE Spirit_Box_App SHALL provide a pure parse function that maps the saved value (a string or `null`) to the Sound_Preference, and a pure serialize function that maps the Sound_Preference to the saved value `1` or `0`. Both functions SHALL have no side effects and SHALL NOT access `localStorage`.
13. FOR ALL Sound_Preference values, THE parse function applied to the result of the serialize function SHALL return the original value (round-trip property).
14. FOR ALL strings other than `0`, including the empty string and `null`, THE parse function SHALL return on.
15. THE Spirit_Box_App SHALL keep the Sound_Preference independent of the Exorcise_Toggle, so that changing one setting does not change the other and each is saved under its own key (`screech.sound` and `screech.exorcise`).

### Requirement 10: Independence from Exorcise

**User Story:** As a user who needs less motion, I want Exorcise to leave the sound alone, so that I can choose sound and motion separately.

#### Acceptance Criteria

1. WHEN the user turns the Exorcise_Toggle on or off, THE Haunt_Player SHALL continue every sound that is already playing without interruption, and SHALL keep the volume, start time and stop time of every sound request made after the change identical to what they would be had the toggle not changed.
2. WHEN the user turns the Sound_Toggle on or off, THE Spirit_Box_App SHALL keep the Exorcise_Toggle state and the Reduced_Motion value identical to their values immediately before the change.
3. WHILE the Exorcise_Toggle is on, THE Haunt_Player SHALL play every sound with the same volume, start time, duration and trigger conditions as when the Exorcise_Toggle is off.
4. WHILE the system `prefers-reduced-motion` setting is reduce, THE Haunt_Player SHALL play every sound with the same volume, start time, duration and trigger conditions as when the setting is no-preference.
5. THE Haunt_Player SHALL take no input from the Exorcise_Toggle state, the Reduced_Motion value or the `prefers-reduced-motion` setting, and THE motion code SHALL take no input from the Sound_Preference or the Sound_Toggle state.
6. THE Sound_Key SHALL differ from the Exorcise storage key `screech.exorcise`, so that writing, clearing or corrupting either saved value leaves the other saved value unchanged.
7. IF the saved Exorcise value or the saved Sound_Preference value is missing or unreadable at startup, THEN THE Spirit_Box_App SHALL apply the default for that one setting only and SHALL leave the other setting at its saved value.

### Requirement 11: Test coverage and project conventions

**User Story:** As a maintainer, I want the sound logic covered by property and unit tests that run in Node, so that regressions in level, spectrum and timing are caught early.

#### Acceptance Criteria

1. WHEN `pnpm test` is run from the repository root, THE Haunt_Synth tests SHALL execute in Node and SHALL complete without a browser, without the Web Audio API and without reading any audio file.
2. THE Haunt_Synth SHALL have at least one fast-check property test and at least one unit test for each exported function.
3. THE Haunt_Synth SHALL have fast-check property tests, each running at least 100 generated cases, for each of the following: the Out_Of_Band_Ratio, the Phone_Band_Share, the Haunt_Peak_Limit, the first sample value, the last sample value, the Attack_Time, determinism (the same Seed yields identical samples), the finite range of every sample (no NaN, no Infinity, no value outside -1 to 1), and the Drone loop seam.
4. THE Haunt_Player decision logic (the Sound_Gate, the Quiet_State function, the 30 ms duplicate rule, the 400 ms crackle limit, the per-letter scrape count and the Sound_Hint show and iOS detection functions) SHALL be implemented as pure functions that take all inputs as arguments and read no clock, no random source and no browser API.
5. THE Haunt_Player decision logic SHALL have at least one unit test and at least one fast-check property test, running at least 100 generated cases, for each of the Sound_Gate, the Quiet_State function, the 30 ms duplicate rule, the 400 ms crackle limit, the per-letter scrape count (including the min(n, Spell_Max_Chars) bound), the Sound_Hint show function and the iOS detection function.
6. THE Sound_Toggle parse and serialize functions SHALL have at least one unit test and a fast-check round-trip property test, running at least 100 generated cases, which checks that parsing the serialized value returns the original value.
7. THE Haunt_Synth and the Haunt_Player decision logic SHALL declare explicit parameter and return types on every exported function, SHALL contain no `any`, and SHALL pass the TypeScript strict-mode type check.
8. IF `pnpm test` runs and any property test or unit test of Haunting Sounds fails, THEN THE `pnpm test` command SHALL exit with a non-zero code and SHALL print the name of each failing test.
9. THE Spirit_Box_App SHALL ship no audio file for Haunting Sounds, and THE production build output SHALL contain no `.mp3`, `.wav`, `.ogg` or `.m4a` file created for them.

### Requirement 12: One-time iOS silent switch hint

**User Story:** As an iPhone user, I want to be told once that the silent switch mutes the sounds, so that I do not think the app is broken when I hear nothing.

#### Acceptance Criteria

1. WHEN the Sound_Preference is on, the device is an iOS_Device, the Awaken_Tap has happened and the Sound_Hint has not been shown before, THE Spirit_Box_App SHALL show the Sound_Hint with the exact text "On iPhone, the silent switch mutes these sounds."
2. WHEN the Spirit_Box_App shows the Sound_Hint, THE Spirit_Box_App SHALL save a value under the Sound_Hint_Key, so that the Sound_Hint is shown at most once per install.
3. WHILE a value is saved under the Sound_Hint_Key, THE Spirit_Box_App SHALL NOT show the Sound_Hint.
4. WHILE the device is not an iOS_Device, THE Spirit_Box_App SHALL NOT show the Sound_Hint.
5. WHILE the Awaken_Tap has not happened, THE Spirit_Box_App SHALL NOT show the Sound_Hint.
6. WHILE the Sound_Preference is off, THE Spirit_Box_App SHALL NOT show the Sound_Hint.
7. THE Spirit_Box_App SHALL treat a device as an iOS_Device WHEN its user agent names iPhone, iPad or iPod, or WHEN its platform is `MacIntel` and its maximum touch points is greater than 1, so that a device with platform `MacIntel` and a maximum touch points of 1 or less (a real Mac) is not an iOS_Device and never shows the Sound_Hint.
8. THE Sound_Hint SHALL play no sound, SHALL block no control and SHALL leave every screen fully usable while it is visible.
9. THE Sound_Hint SHALL use plain words with no emoji, SHALL have a text contrast ratio of at least 4.5:1 against its background, and SHALL use the colour tokens of the existing notices and not the error red.
10. THE Spirit_Box_App SHALL provide a pure function that takes the Sound_Preference, the iOS_Device result, the Awaken_Tap state and the saved Sound_Hint_Key value as arguments and returns whether to show the Sound_Hint. The function SHALL read no `localStorage`, no clock, no random source and no browser API.
11. THE Spirit_Box_App SHALL provide a pure function that takes the user agent string, the platform string and the maximum touch points as arguments and returns whether the device is an iOS_Device.
12. FOR ALL combinations of Sound_Preference, iOS_Device result, Awaken_Tap state and saved Sound_Hint_Key value, THE show function SHALL return true if and only if the Sound_Preference is on, the device is an iOS_Device, the Awaken_Tap has happened and no value is saved.
13. FOR ALL user agent strings that do not name iPhone, iPad or iPod, and all platform strings other than `MacIntel`, THE iOS detection function SHALL return false. FOR ALL platform values of `MacIntel` with a maximum touch points greater than 1, THE iOS detection function SHALL return true, and with a maximum touch points of 1 or less and a user agent that does not name iPhone, iPad or iPod, THE function SHALL return false.
14. IF `localStorage` is unavailable or throws on read or write of the Sound_Hint_Key, THEN THE Spirit_Box_App SHALL keep the shown state in memory for the rest of the session, SHALL show the Sound_Hint at most once in that session, SHALL show no error dialog and SHALL continue to work.
15. THE Sound_Hint_Key SHALL differ from the Sound_Key and from the Exorcise storage key `screech.exorcise`, so that writing, clearing or corrupting any one of the three saved values leaves the other two unchanged.
16. THE iOS detection function SHALL have unit tests for a Mac (platform `MacIntel`, 0 maximum touch points, desktop Safari Mac user agent) returning false, and for an iPad in desktop mode (platform `MacIntel`, 5 maximum touch points, the same Mac user agent) returning true.

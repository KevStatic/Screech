# Requirements Document

## Introduction

Ghost Hunt is a party game mode for the Spirit_Box_App in `apps/web`. A host creates a Hunt of 3 to 7 Spirits on a laptop. Each Spirit has a name, a clue (a riddle that points to the next hiding place) and an optional note for the host about where to hide that phone. The host reads an opening riddle aloud to start the game, and prints or shows one Setup_QR per Spirit. A person scans a Setup_QR with a phone, hides the phone, and the phone becomes that Spirit's Beacon. The Beacon repeatedly screeches its clue as a `hunt-clue` Packet. Players walk around with the normal Listen_Screen open. When a player's phone hears a clue, the clue is spelled on the Ouija board, the Spirit_Counter goes up, and finding every Spirit ends the Hunt on a "Hunt complete" screen.

Ghost Hunt reuses what already exists and adds no new protocol type:

- The `hunt-clue` Packet type, the 140-byte `SIZE_CAP`, `encode()` and `decode()` already exist in `packages/core` (spec `screech-protocol`, requirement 7). Ghost Hunt defines only the text carried in the `hunt-clue` Body, as a pure build and parse pair in `packages/core`.
- The Listen_Screen, K_II_Meter, band energy function, Ouija_Spelling, Reveal_Screen, Hold_State_Machine, `unlockAudio`, `ensureRunning`, Transmit_Volume and Exorcise_Toggle come from spec `spirit-box-app`. Ghost Hunt extends them and does not replace them.
- The rule that no UI_Sound plays on the Listen_Screen, and the Quiet_State rules, come from spec `haunting-sounds`.

Ghost Hunt amends three rules of `spirit-box-app`. First, 13.6 shows the full decoded text of a `hunt-clue` Packet in the Action_Card. For a `hunt-clue` Packet that parses, this spec replaces that behaviour with the Hunt_Reveal or the Already_Note in requirement 10. Second, 12.12 suppresses a repeated Reveal_Screen for identical bytes within 5 seconds. A Beacon repeats the same Packet every 15 to 20 seconds, so requirement 10 states what happens on a repeat. Third, the Listen_Screen stops capture whenever it shows a result. For a clue of a Spirit that the Player already found, requirement 10 keeps the Listen_Screen open and capturing, so that a Player searching near a found Spirit is not thrown off the Listen_Screen every 15 to 20 seconds.

### Assumptions

The brief leaves the following open. These requirements resolve each point, and the design phase may refine them.

1. **Beacon data in the link.** The brief writes the Setup_Link fragment as `#hunt=...&spirit=N`. A Beacon needs the Spirit name, the clue and the total, and the app has no backend, so the Setup_Link fragment carries the Hunt_ID, the spirit number, the total, the name and the clue. Only the fragment is used, so none of it is sent to a server. The Hide_At and the Opening_Riddle are for the host only and are not part of the Setup_Link.
2. **Hunt_ID form.** The Hunt_ID is 6 characters from an unambiguous 31-character alphabet (no `0`, `O`, `1`, `I`, `L`), which gives about 887 million IDs.
3. **Time taken.** Time taken is the time from the first Spirit found to the last Spirit found on that phone, because the player's clock does not start until the first clue is heard.
4. **Name limit.** A Spirit name is 1 to 24 UTF-8 bytes, so that the clue keeps most of the Packet.
5. **Beacon interval.** The interval is measured from the start of one screech to the start of the next, and a random jitter inside the 15 to 20 second range spreads out Beacons that were started together.
6. **One Beacon, one purpose.** A phone in Beacon mode only sends. It does not listen and it plays no Haunting Sounds.
7. **Beacon collisions.** Two Beacons that screech at the same moment can garble each other. Jitter lowers the chance, and the next screech repairs the miss. Collision detection is not part of v1.
8. **Range and airtime.** The listening range is about 1.5 m, and a Player must stay that close for the whole screech. A longer Packet means a longer screech, so the setup screen shows the Airtime of each clue and the built-in packs stay at 90 bytes or less.
9. **Host-only text limits.** The brief gives no limit for the Opening_Riddle, so it is limited to 200 characters to keep the large-text display on one screen. The Hide_At limit of 40 characters comes from the brief.
10. **Parser and decoder strictness.** The Clue_Parser accepts only text in the exact form the Clue_Builder produces, and the Link_Decoder checks field rules but not Packet size. The 140-byte check happens in the Clue_Builder when the Beacon builds the Packet.

### Out of scope for v1

Sealed hunts (encrypted clues), a live leaderboard, a backend or check-in API, sharing progress between phones, a Hunt editor for a Hunt that is already printed, and any hint of distance or direction beyond the existing K_II_Meter.

## Glossary

- **Spirit_Box_App**: The React web app in `apps/web`.
- **Core**: The `@screech/core` package.
- **Hunt**: One game: a Hunt_ID, a total of 3 to 7 Spirits, and the name, Hide_At and clue of each Spirit.
- **Spirit**: One hiding place in a Hunt, with a Spirit_Index, a name and a clue.
- **Spirit_Index**: The position of a Spirit in the Hunt, an integer from 1 to the Spirit_Total inclusive.
- **Spirit_Total**: The number of Spirits in the Hunt, an integer from 3 to 7 inclusive.
- **Hunt_ID**: A string of exactly 6 characters from the Hunt_Alphabet. It identifies one Hunt.
- **Hunt_Alphabet**: The 31 characters `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (uppercase letters and digits without `0`, `O`, `1`, `I` and `L`).
- **Spirit_Name**: The text name of a Spirit, 1 to 24 UTF-8 bytes.
- **Clue_Text**: The riddle text of a Spirit, 1 or more characters.
- **Hide_At**: Optional host-only text of a Spirit, 0 to 40 characters, that says where the host hides that Spirit's phone, for example "the coffee machine". It is never part of the Clue_Fields, the Clue_Packet, the Setup_Link, the Found_State or the Progress_Store.
- **Opening_Riddle**: One optional host-only text of the Hunt, 0 to 200 characters, that leads Players to Spirit 1. The host reads it aloud to start the game. It is never part of the Clue_Fields, the Clue_Packet, the Setup_Link, the Found_State or the Progress_Store.
- **Clue_Fields**: The five values Hunt_ID, Spirit_Index, Spirit_Total, Spirit_Name and Clue_Text.
- **Clue_Builder**: The pure function in `packages/core` that turns Clue_Fields into a `hunt-clue` Payload and a Packet through Core `encode()`.
- **Clue_Parser**: The pure function in `packages/core` that turns the text of a decoded `hunt-clue` Payload back into Clue_Fields.
- **Clue_Packet**: A Core Packet of type `hunt-clue` produced by the Clue_Builder, at most `SIZE_CAP` (140) bytes.
- **Clue_Packet_Size**: The length in bytes of the Clue_Packet for the current Clue_Fields, as returned by Core `encode()`.
- **Airtime_Function**: The pure function `airtimeSeconds(packetBytes)` that returns `ceil(0.7 + 0.0614 * packetBytes)`, the whole seconds a screech of that many bytes takes.
- **Airtime**: The value of the Airtime_Function for a Clue_Packet_Size.
- **Long_Clue_Threshold**: 100 bytes, the Clue_Packet_Size above which the Long_Clue_Note is shown.
- **Long_Clue_Note**: The non-blocking text "Long clue: players must stay close for about N s." shown in bone white for a clue above the Long_Clue_Threshold.
- **Hunt_Setup_Screen**: The screen where the host creates a Hunt, designed for a laptop browser and usable on a 390 px portrait phone.
- **Riddle_Pack**: A built-in set of one Opening_Riddle, 7 entries, each with a Spirit_Name, a Hide_At and a Clue_Text, and one Finale_Line. The three packs are `office`, `home` and `classroom`. The Clue_Text of entry k leads to the Hide_At of entry k+1, and the Opening_Riddle leads to the Hide_At of entry 1.
- **Finale_Line**: The closing text of a Riddle_Pack, for example "That was the last of us. Return to the circle.", used as the Clue_Text of the last Spirit of a Hunt.
- **Applied_Pack**: The Riddle_Pack that was last filled into the draft of the Hunt_Setup_Screen, or none when no pack was filled.
- **Custom_Text**: A Spirit_Name, Hide_At, Clue_Text or Opening_Riddle typed by the host, which replaces a Riddle_Pack value.
- **Byte_Counter**: The per-clue display on the Hunt_Setup_Screen showing Clue_Packet_Size against `SIZE_CAP` and the Airtime.
- **Setup_Link**: A URL of the app whose fragment carries the Clue_Fields for one Spirit, in the form `#hunt=<Hunt_ID>&spirit=<Spirit_Index>&total=<Spirit_Total>&name=<name>&clue=<clue>`, with `name` and `clue` percent-encoded.
- **Link_Encoder**: The pure function that turns a base URL and Clue_Fields into a Setup_Link.
- **Link_Decoder**: The pure function that turns a URL fragment into Clue_Fields or an error.
- **Setup_QR**: A QR code, drawn with the `qrcode` package, that encodes one Setup_Link.
- **QR_Card**: The area on the Hunt_Setup_Screen and on the print page that holds one Setup_QR with its "Spirit N of M" text, Spirit_Name, Hunt_ID and Hide_At.
- **Print_Page**: The print layout of the Hunt_Setup_Screen.
- **Beacon**: A phone running the Beacon_Screen for one Spirit.
- **Beacon_Screen**: The screen titled "BEACON · Spirit N of M", shown when the app opens with a valid Setup_Link.
- **Beacon_Interval**: The time from the start of one Beacon screech to the start of the next, an integer number of milliseconds from 15000 to 20000 inclusive.
- **Beacon_Schedule**: The pure function that, given a random value from 0 up to but not including 1, returns the next Beacon_Interval.
- **Countdown**: The whole seconds, rounded up, from the current time to the time of the next Beacon screech.
- **Wake_Lock**: The browser Screen Wake Lock API (`navigator.wakeLock`).
- **Audio_Keepalive**: The Spirit_Box_App behaviour that calls `ensureRunning` to keep the Audio_Context running while the Beacon_Screen is open.
- **Player**: A person using the Listen_Screen to find Spirits.
- **Hunt_Intake**: The result of applying the Found_Reducer to a heard Clue_Packet, one of `new` (the Spirit_Index was not yet found), `already` (the Spirit_Index was already found) or `complete` (the Found_State already held a time of completion).
- **Hunt_Reveal**: The Reveal_Screen content for a heard Clue_Packet with a `new` Hunt_Intake: the Ouija_Spelling of the Clue_Text, then the Spirit_Counter and the Follow_Line.
- **Follow_Line**: The static text "Follow the K-II meter. More lights, closer spirit." shown under the Spirit_Counter on the Hunt_Reveal.
- **Already_Note**: The inline note shown above the K_II_Meter on the Listen_Screen for an `already` Hunt_Intake, with the text "Already found · Spirit N of M · <name>" and the Read_Again_Control.
- **Read_Again_Control**: The control labelled "Read clue again" on the Already_Note, which shows the Clue_Text as plain text.
- **Found_State**: The record, for one Hunt_ID on one phone, of which Spirit_Index values were found, the Spirit_Name of each, the time of the first find and the time of completion.
- **Found_Reducer**: The pure function that takes a Found_State and a Clue_Fields value and a time, and returns the next Found_State.
- **Spirit_Counter**: The text "Spirits found: X of Y" with the Spirit_Name of each found Spirit.
- **Progress_Store**: The code that saves and loads Found_State in `localStorage` under the key `screech.hunt.<Hunt_ID>`.
- **Hunt_Complete_Screen**: The screen that shows "Hunt complete" and the time taken.
- **Time_Taken**: The time from the first find to the completion in a Found_State, shown as minutes and seconds in the form `M:SS`.
- **Listen_Screen**, **K_II_Meter**, **Reveal_Screen**, **Ouija_Spelling**, **Exorcise_Toggle**, **Reduced_Motion**, **Hold_State_Machine**, **Hold_Duration**, **Audio_Context**, **Audio_Engine**, **Transmit_Volume**, **unlockAudio**, **ensureRunning**, **UI_Sound**, **Quiet_State**: As defined in the `spirit-box-app` and `haunting-sounds` specs.
- **Codec_Error**: As defined in the `screech-protocol` spec.

## Requirements

### Requirement 1: Hunt clue Packet build and parse

**User Story:** As a host, I want each clue to travel as a compact Packet, so that a Player's phone can recover the Hunt, the Spirit and the riddle from one screech.

#### Acceptance Criteria

1. THE Clue_Builder SHALL accept Clue_Fields and return either a Clue_Packet or a Codec_Error, and SHALL perform no I/O and read no clock or random source.
2. WHEN the Clue_Builder receives valid Clue_Fields, THE Clue_Builder SHALL build a `hunt-clue` Payload whose text holds the Hunt_ID, Spirit_Index, Spirit_Total, Spirit_Name and Clue_Text, SHALL encode it with Core `encode()`, and SHALL return a Clue_Packet whose Clue_Packet_Size is from 1 to `SIZE_CAP` (140) bytes inclusive.
3. FOR ALL valid Clue_Fields whose Clue_Packet is at most `SIZE_CAP` bytes, THE Clue_Parser SHALL return Clue_Fields equal to the original when given the text of the Payload that Core `decode()` returns for that Clue_Packet (round-trip property).
4. THE Clue_Builder SHALL replace each control character (code points 0 to 31 and 127) in the Spirit_Name and in the Clue_Text with a single space, then trim leading and trailing whitespace, before validating and building, so that the Payload text contains no field separator from the user's input.
5. FOR ALL Clue_Fields that contain no control characters and no leading or trailing whitespace in the Spirit_Name or Clue_Text, THE Clue_Builder SHALL leave the Spirit_Name and the Clue_Text unchanged, so that the round-trip property of criterion 3 returns the same names and clues that were entered.
6. IF the Hunt_ID is not exactly 6 characters of the Hunt_Alphabet, THEN THE Clue_Builder SHALL return a Codec_Error with code `invalid-payload` and field `huntId`, and SHALL return no Clue_Packet.
7. IF the Spirit_Total is not an integer from 3 to 7 inclusive, THEN THE Clue_Builder SHALL return a Codec_Error with code `invalid-payload` and field `total`, and SHALL return no Clue_Packet.
8. IF the Spirit_Index is not an integer from 1 to the Spirit_Total inclusive, THEN THE Clue_Builder SHALL return a Codec_Error with code `invalid-payload` and field `index`, and SHALL return no Clue_Packet.
9. IF the Spirit_Name is empty after replacing control characters and trimming whitespace, or exceeds 24 UTF-8 bytes, THEN THE Clue_Builder SHALL return a Codec_Error with code `invalid-payload` and field `name`, and SHALL return no Clue_Packet.
10. IF the Clue_Text is empty after replacing control characters and trimming whitespace, THEN THE Clue_Builder SHALL return a Codec_Error with code `invalid-payload` and field `clue`, and SHALL return no Clue_Packet.
11. IF the Clue_Packet would exceed `SIZE_CAP` (140) bytes, THEN THE Clue_Builder SHALL return a Codec_Error with code `too-large` and the computed Clue_Packet_Size in bytes, and SHALL NOT return a truncated Packet.
12. IF more than one Clue_Fields value is invalid, THEN THE Clue_Builder SHALL return exactly one Codec_Error, reporting the first failing field in the order `huntId`, `total`, `index`, `name`, `clue`, and SHALL check size (`too-large`) only after all five fields are valid.
13. IF the text given to the Clue_Parser does not hold exactly the five Clue_Fields in the defined layout, or holds a Hunt_ID, Spirit_Total, Spirit_Index or Spirit_Name that the Clue_Builder would reject, or holds a Spirit_Name or Clue_Text that is not in the form the Clue_Builder produces (control characters replaced, whitespace trimmed), THEN THE Clue_Parser SHALL return a Codec_Error with code `invalid-body` and SHALL NOT return partial fields.
14. IF the Clue_Parser receives a value that is not a string, including an empty string, THEN THE Clue_Parser SHALL return a Codec_Error with code `invalid-body` and SHALL NOT throw.
15. THE Clue_Builder and THE Clue_Parser SHALL reside in `packages/core/src`, SHALL be exported from the Core public index, and SHALL import no Node.js API and no browser-only API.
16. THE Clue_Builder SHALL produce byte-for-byte identical Packets for identical Clue_Fields.

### Requirement 2: Hunt ID

**User Story:** As a host, I want a short random ID for each Hunt, so that progress from different Hunts never mixes.

#### Acceptance Criteria

1. WHEN the host opens the Hunt_Setup_Screen and no Hunt_ID exists for the current session, THE Hunt_Setup_Screen SHALL generate a Hunt_ID of exactly 6 characters from the Hunt_Alphabet, and SHALL show it within 100 ms of the screen opening.
2. THE Hunt_ID generator SHALL be a pure function of an array of random bytes that the caller supplies, and SHALL read no clock and no random source of its own.
3. WHEN the Hunt_ID generator is called, THE Spirit_Box_App SHALL fill the array with at least 6 bytes from `crypto.getRandomValues`.
4. FOR ALL arrays of at least 6 random bytes, THE Hunt_ID generator SHALL return a string of exactly 6 characters, each in the Hunt_Alphabet.
5. FOR ALL arrays of at least 6 random bytes, THE Hunt_ID generator SHALL return the same Hunt_ID when given the same array (determinism property).
6. THE Hunt_ID generator SHALL map each random byte to a Hunt_Alphabet character without modulo bias, by discarding any byte of 217 or more and drawing further bytes until 6 characters are chosen.
7. IF the array holds too few usable bytes to choose 6 characters after discarding, THEN THE Hunt_ID generator SHALL return an error and no Hunt_ID, and SHALL NOT throw.
8. THE Hunt_Setup_Screen SHALL show the Hunt_ID as visible text of at least 6 characters, so that a host can read it aloud or type it.
9. WHEN the host activates the control to make a new Hunt_ID, THE Hunt_Setup_Screen SHALL replace the Hunt_ID and every Setup_QR with ones for the new Hunt_ID within 100 ms, and SHALL keep every Spirit_Name, Hide_At, Clue_Text and the Opening_Riddle entered.
10. THE control to make a new Hunt_ID SHALL have a touch target of at least 44 px by 44 px.
11. IF `crypto.getRandomValues` is unavailable or throws, THEN THE Hunt_Setup_Screen SHALL show a plain-words message that a Hunt_ID could not be made, SHALL show no Setup_QR, SHALL disable every control that creates, copies or prints a Setup_Link, and SHALL keep every Spirit_Name, Hide_At, Clue_Text and the Opening_Riddle entered.

### Requirement 3: Hunt setup

**User Story:** As a host, I want to name my Spirits, write their clues, note where each phone is hidden and read an opening riddle, so that the players follow a trail of riddles from the first words to the last Spirit.

#### Acceptance Criteria

1. THE Spirit_Box_App SHALL offer a control, with a touch target of at least 44 px by 44 px, that opens the Hunt_Setup_Screen without requesting microphone access.
2. WHEN the Hunt_Setup_Screen first opens, THE Hunt_Setup_Screen SHALL show a Spirit_Total of 5 selected, and SHALL offer exactly the values 3, 4, 5, 6 and 7 for selection and no other value.
3. WHEN the host changes the Spirit_Total, THE Hunt_Setup_Screen SHALL show exactly that many Spirit rows within 100 ms, each with a Spirit_Name input, a Hide_At input and a Clue_Text input, and SHALL keep the Spirit_Name, Hide_At and Clue_Text values already entered in rows 1 to min(old total, new total).
4. WHEN the host reduces the Spirit_Total, THE Hunt_Setup_Screen SHALL keep the Spirit_Name, Hide_At and Clue_Text values of the removed rows in memory until the page is closed or reloaded. WHEN the host raises the Spirit_Total again and criterion 13 does not re-fill the rows, THE Hunt_Setup_Screen SHALL restore those values into the re-added rows within 100 ms.
5. THE Hunt_Setup_Screen SHALL offer exactly three Riddle_Packs named `office`, `home` and `classroom`, and each Riddle_Pack SHALL hold exactly one Opening_Riddle, exactly 7 entries of Spirit_Name, Hide_At and Clue_Text, and exactly one Finale_Line.
6. THE Clue_Text of entry k of every Riddle_Pack, for k from 1 to 6, SHALL lead to the Hide_At of entry k+1, THE Opening_Riddle SHALL lead to the Hide_At of entry 1, and THE Finale_Line SHALL tell the Players that the Hunt is over and where to return.
7. WHEN the host chooses a Riddle_Pack for a Spirit_Total M and no Spirit_Name, Hide_At or Clue_Text of rows 1 to M and no Opening_Riddle holds Custom_Text, THE Hunt_Setup_Screen SHALL within 100 ms fill rows 1 to M-1 with entries 1 to M-1 of the pack (Spirit_Name, Hide_At and Clue_Text), fill row M with the Spirit_Name and Hide_At of entry M and the Finale_Line as its Clue_Text, and fill the Opening_Riddle with the Opening_Riddle of the pack. THE Hunt_Setup_Screen SHALL leave the rows beyond M unchanged.
8. THE Spirit_Name of every built-in Riddle_Pack entry SHALL be 1 to 24 UTF-8 bytes, THE Hide_At of every entry SHALL be 1 to 40 characters, THE Opening_Riddle of every pack SHALL be 1 to 200 characters, and every built-in text SHALL use ASCII characters only. THE Clue_Text of every entry and the Finale_Line SHALL each produce a Clue_Packet of at most 90 bytes when built by the Clue_Builder with the Spirit_Name of any entry of that pack, any valid Hunt_ID, and any valid Spirit_Index and Spirit_Total.
9. WHEN the host types in a Spirit_Name input, a Hide_At input, a Clue_Text input or the Opening_Riddle input and the value is not empty after trimming whitespace, THE Hunt_Setup_Screen SHALL mark that field as holding Custom_Text. WHEN the host empties a field, THE Hunt_Setup_Screen SHALL remove the Custom_Text marking of that field. No action other than the overwrite in criterion 11 or the re-fill in criterion 13 SHALL overwrite a field that holds Custom_Text.
10. WHEN the host chooses a Riddle_Pack and at least one field that criterion 7 would overwrite holds Custom_Text, THE Hunt_Setup_Screen SHALL show a confirmation step that states in plain words the number of those fields that hold Custom_Text, with a confirm control and a cancel control each at least 44 px by 44 px, and SHALL change no field until the host confirms.
11. WHEN the host confirms the overwrite, THE Hunt_Setup_Screen SHALL fill the fields as in criterion 7 within 100 ms, SHALL clear the Custom_Text marking of every field that was overwritten, and SHALL record the pack as the Applied_Pack.
12. WHEN the host cancels the overwrite, THE Hunt_Setup_Screen SHALL leave every row, the Opening_Riddle and the Applied_Pack unchanged.
13. WHEN the host changes the Spirit_Total, IF an Applied_Pack exists and no Spirit_Name, Hide_At or Clue_Text of any of the 7 rows and no Opening_Riddle holds Custom_Text, THEN THE Hunt_Setup_Screen SHALL fill the fields for the new Spirit_Total as in criterion 7 with the Applied_Pack within 100 ms, so that the Finale_Line is the Clue_Text of the last Spirit and of no other Spirit.
14. WHEN the host changes the Spirit_Total, IF an Applied_Pack exists and at least one Spirit_Name, Hide_At or Clue_Text of the 7 rows or the Opening_Riddle holds Custom_Text, THEN THE Hunt_Setup_Screen SHALL leave every row unchanged and SHALL show a plain-words note that the pack text was not filled again because some text is the host's own and that the Clue_Text of the last Spirit should be checked.
15. THE Hunt_Setup_Screen SHALL offer on each row an optional Hide_At input, and SHALL measure the length of the Hide_At as the number of Unicode code points after replacing each control character (code points 0 to 31 and 127) with a single space and trimming leading and trailing whitespace. THE Hunt_Setup_Screen SHALL measure the length of the Opening_Riddle in the same way.
16. IF a Hide_At is longer than 40 characters, or the Opening_Riddle is longer than 200 characters, THEN THE Hunt_Setup_Screen SHALL show a plain-words message in the form "Hide at is <length>/40 characters" or "Opening riddle is <length>/200 characters" (naming the row's Spirit_Index for a Hide_At), SHALL show no Setup_QR for any Spirit, SHALL disable every control that creates, copies or prints a Setup_Link, and SHALL keep the typed text unchanged.
17. THE Hunt_Setup_Screen SHALL offer one optional Opening_Riddle input above the Spirit rows. WHILE the Opening_Riddle is not empty, THE Hunt_Setup_Screen SHALL show it as plain text at a font size of at least 24 CSS px at the top of the screen, so that the host can read it aloud to start the Hunt.
18. THE Spirit_Box_App SHALL NOT include the Hide_At or the Opening_Riddle in the Clue_Fields, the Clue_Packet, the Setup_Link, the Found_State or the Progress_Store. A change of the Hide_At or the Opening_Riddle SHALL NOT change any byte of any Clue_Packet, any Byte_Counter value or any Setup_QR.
19. IF any row has a Spirit_Name or Clue_Text that is empty after replacing control characters and trimming whitespace, THEN THE Hunt_Setup_Screen SHALL show no Setup_QR for any Spirit, SHALL disable every control that creates, copies or prints a Setup_Link, and SHALL show a plain-words message that names each incomplete row by its Spirit_Index and the empty field.
20. THE Hunt_Setup_Screen SHALL show the Spirit_Index of each row as visible text, in the range 1 to Spirit_Total.
21. WHEN every row builds without error and no Hide_At or Opening_Riddle is over its limit, THE Hunt_Setup_Screen SHALL show, on the QR_Card next to each Setup_QR, the text "Spirit N of M", the Spirit_Name and the Hunt_ID, so that printed codes stay in order. WHEN the Hide_At of that row is not empty, THE QR_Card SHALL also show the text "Hide at: <Hide_At>" as plain text.
22. WHILE the viewport width is 1280 px or any width from 320 px to 430 px inclusive, THE Hunt_Setup_Screen SHALL keep every Spirit row, input and control reachable with a document scroll width not greater than the viewport width.
23. THE Hunt_Setup_Screen SHALL give each Spirit_Name input, Hide_At input, Clue_Text input and the Opening_Riddle input a visible text label that names the field and, for a row input, the Spirit_Index, so that assistive technology announces which field of which Spirit is focused.

### Requirement 4: Byte counter, airtime and blocking

**User Story:** As a host, I want to see how heavy and how long each clue is, so that no clue is too long to cross over or too long for a player to stay in range.

#### Acceptance Criteria

1. WHEN a Spirit_Name or Clue_Text of a row changes, THE Hunt_Setup_Screen SHALL compute the Clue_Packet_Size of that row with the Clue_Builder and update the Byte_Counter of that row within 100 ms, and WHEN the Spirit_Total or the Hunt_ID changes, THE Hunt_Setup_Screen SHALL do the same for every row within 100 ms.
2. WHEN the Clue_Builder returns a Clue_Packet for a row, THE Byte_Counter of that row SHALL show the Clue_Packet_Size, `SIZE_CAP` and the Airtime in the form `<size>/<cap> bytes · about <N> s`, where `<size>` is the Clue_Packet_Size as an integer from 1 to 140, `<cap>` is 140, and `<N>` is the value of the Airtime_Function for that Clue_Packet_Size.
3. WHEN the Clue_Packet_Size of a row is exactly 140 bytes, THE Byte_Counter of that row SHALL show `140/140 bytes · about <N> s` in bone white and not in blood red, SHALL NOT show an error message, and THE Hunt_Setup_Screen SHALL keep every Setup_QR and every control for that row enabled.
4. IF the Clue_Builder returns a `too-large` error for a row, THEN THE Byte_Counter of that row SHALL show the message "Too heavy to cross over (<length>/140 bytes)", where `<length>` is the computed Clue_Packet_Size as an integer from 141 upward, SHALL show the message in blood red, and SHALL carry the state in the message text itself, so that the error is identifiable without colour. THE Hunt_Setup_Screen SHALL keep the typed text unchanged.
5. IF the Clue_Builder returns an `invalid-payload` error for a row, THEN THE Byte_Counter of that row SHALL show one plain-words message that names the one field the Clue_Builder reported (`huntId`, `total`, `index`, `name` or `clue`) and the cause, SHALL NOT show a `<size>/<cap> bytes` value, and THE Hunt_Setup_Screen SHALL keep the typed text unchanged. For a Spirit_Name over 24 UTF-8 bytes, the message SHALL include the measured value and the limit in the form `<length>/24 bytes`.
6. WHILE at least one row has a Clue_Builder error, THE Hunt_Setup_Screen SHALL show no Setup_QR for any Spirit, SHALL disable every control that creates, copies or prints a Setup_Link, and SHALL show a plain-words summary that names the Spirit_Index of the row with the lowest Spirit_Index that has an error.
7. WHEN the Clue_Builder returns a Clue_Packet for every row and no Hide_At or Opening_Riddle is over its limit, THE Hunt_Setup_Screen SHALL enable every control that creates, copies or prints a Setup_Link within 100 ms of the last change, and SHALL show a Setup_QR for every Spirit within 500 ms of the last change, as in requirement 6.3.
8. WHEN a row changes from an error to a valid state, THE Byte_Counter of that row SHALL replace the error message with the `<size>/<cap> bytes · about <N> s` value within 100 ms.
9. THE Byte_Counter SHALL use the same Clue_Builder call and Core `encode()` result that the Beacon later transmits, so that for identical Clue_Fields the Clue_Packet_Size shown on the Hunt_Setup_Screen equals the byte length of the Packet that the Beacon_Screen sends, and a clue accepted on the Hunt_Setup_Screen is never rejected as too long on the Beacon_Screen.
10. THE Hunt_Setup_Screen SHALL NOT trim, cut or otherwise change any typed text to make a clue fit.
11. THE Byte_Counter SHALL meet a contrast ratio of at least 4.5:1 against its background in both its normal and its error state, and SHALL be exposed to assistive technology as text in a polite live region, so that each change of its value is announced once.
12. THE Airtime_Function SHALL return `ceil(0.7 + 0.0614 * packetBytes)` as an integer number of seconds for any finite `packetBytes` of at least 0, SHALL return a value that does not decrease when `packetBytes` increases, and SHALL perform no I/O and read no clock or random source.
13. THE Airtime_Function SHALL return a value whose absolute difference from the reference is at most 1 second for each of these inputs: reference 2.3 s for 26 bytes, 4 s for 53 bytes and 9.3 s for 140 bytes, the measured airtimes of the Audio_Engine.
14. THE Airtime_Function SHALL reside in `apps/web/src/logic` and import neither React nor any browser audio API.
15. IF the Clue_Packet_Size of a row is above the Long_Clue_Threshold (100 bytes) and at most `SIZE_CAP`, THEN THE Byte_Counter of that row SHALL show the Long_Clue_Note with the Airtime of that row as `<N>`, in bone white and not in blood red, and THE Hunt_Setup_Screen SHALL keep every Setup_QR and every control for that row enabled.
16. WHEN the Clue_Packet_Size of a row is 100 bytes or less, or the row has a Clue_Builder error, THE Byte_Counter of that row SHALL NOT show the Long_Clue_Note.
17. IF `packetBytes` given to the Airtime_Function is not a finite number of at least 0, THEN THE Airtime_Function SHALL return 0 and SHALL NOT throw.

### Requirement 5: Setup link encode and decode

**User Story:** As a host, I want each QR code to carry everything one Beacon needs, so that the Beacon works without a server.

#### Acceptance Criteria

1. WHEN the Link_Encoder receives a base URL and valid Clue_Fields, THE Link_Encoder SHALL return a Setup_Link equal to the base URL with any existing fragment removed, followed by `#hunt=<Hunt_ID>&spirit=<Spirit_Index>&total=<Spirit_Total>&name=<name>&clue=<clue>`, with the parameters in that order, Spirit_Index and Spirit_Total written as base-10 integers without leading zeros or signs, and the name and clue values percent-encoded as UTF-8, and SHALL add no Hide_At and no Opening_Riddle.
2. THE Link_Encoder SHALL percent-encode every byte of the name and clue values except the unreserved characters `A-Z`, `a-z`, `0-9`, `-`, `.`, `_` and `~`, so that `&`, `=`, `#`, `%` and `+` in the user's text never act as separators.
3. IF the Clue_Builder would reject the Clue_Fields on a field rule, THEN THE Link_Encoder SHALL return the same Codec_Error as the Clue_Builder and no Setup_Link.
4. IF the base URL is empty or is not an absolute `http` or `https` URL, THEN THE Link_Encoder SHALL return an error that states in plain words that the base URL is invalid, and no Setup_Link.
5. FOR ALL valid Clue_Fields whose Clue_Packet is at most `SIZE_CAP` bytes, THE Link_Decoder SHALL return Clue_Fields equal to the original when given the fragment of the Setup_Link that the Link_Encoder returned for them (round-trip property).
6. THE Link_Decoder SHALL accept a fragment with or without one leading `#`, and SHALL accept the five parameters in any order.
7. THE Link_Decoder SHALL treat the first `=` in each `&`-separated parameter as the split between key and value, SHALL read keys case-sensitively, and SHALL ignore parameters whose key is not one of `hunt`, `spirit`, `total`, `name` or `clue`.
8. THE Link_Decoder SHALL accept `spirit` and `total` only as base-10 integers made of the digits `0-9` with no sign, no decimal point and no whitespace, and SHALL accept `hunt` only as exactly 6 characters of the Hunt_Alphabet.
9. IF the fragment holds at least one of the five parameters and lacks any of `hunt`, `spirit`, `total`, `name` or `clue`, holds any of them more than once, or holds a value that breaks a field rule of the Clue_Builder (the Link_Decoder does not check the Clue_Packet_Size), THEN THE Link_Decoder SHALL return an error that states in plain words which parameter is wrong and, where one applies, the measured value and the limit, and SHALL NOT return partial Clue_Fields.
10. IF the percent-encoding in `name` or `clue` is malformed or does not decode to valid UTF-8, THEN THE Link_Decoder SHALL return an error that names the parameter, and SHALL NOT throw.
11. IF the Link_Decoder receives an empty fragment, a fragment of only `#`, or a fragment that holds none of the five parameters, THEN THE Link_Decoder SHALL return a result that tells the Spirit_Box_App to start normally, with no error message.
12. THE Link_Decoder SHALL accept a fragment of up to 2048 characters, and IF the fragment is longer, THEN THE Link_Decoder SHALL return an error that states in plain words that the link is too long, and SHALL NOT throw.
13. THE Link_Decoder SHALL perform no I/O and read no clock or random source, and SHALL return identical output for identical input.
14. FOR ALL strings, THE Link_Decoder SHALL return either Clue_Fields, a start-normally result or an error, and SHALL NOT throw.
15. THE Link_Encoder and THE Link_Decoder SHALL reside in `apps/web/src/logic` and import neither React nor any browser audio API.

### Requirement 6: Setup QR codes and print page

**User Story:** As a host, I want one QR code per Spirit, so that I can print or show them and set up each Beacon with one scan.

#### Acceptance Criteria

1. WHEN every row builds without error and no Hide_At or Opening_Riddle is over its limit, THE Hunt_Setup_Screen SHALL render one Setup_QR per Spirit, from 3 to 7 in total and equal to the Spirit_Total, using the `qrcode` package, each encoding the Setup_Link of that Spirit, within 500 ms of the last change.
2. THE Hunt_Setup_Screen SHALL build each Setup_Link from the current page origin and path, with any existing fragment and query string removed, so that the link opens the same deployment that the host uses.
3. WHEN the Spirit_Name or Clue_Text of a row, the Spirit_Total or the Hunt_ID changes and every row still builds without error, THE Hunt_Setup_Screen SHALL redraw the affected Setup_QRs within 500 ms, so that no Setup_QR encodes an earlier Setup_Link.
4. THE Hunt_Setup_Screen SHALL render each Setup_QR with dark modules on a light background at a contrast ratio of at least 4.5:1, with a quiet zone of at least 4 modules on every side, with each module drawn as a whole number of device pixels and at least 3 CSS px wide, and at a displayed size of at least 160 px by 160 px, so that phone cameras can scan it.
5. WHEN a Setup_QR is rendered, THE Hunt_Setup_Screen SHALL give it a text alternative that states "Spirit N of M" and the Spirit_Name, so that the code is identifiable to assistive technology.
6. IF the `qrcode` package throws an error or does not produce a QR code for a Spirit, or the Setup_QR cannot be drawn at the module size of criterion 4 inside the available width, THEN THE Hunt_Setup_Screen SHALL show the Setup_Link of that Spirit as selectable text, SHALL show a plain-words message stating that the QR code for that Spirit could not be drawn, SHALL keep the other Setup_QRs, and SHALL keep every typed value unchanged.
7. THE Hunt_Setup_Screen SHALL offer for each Spirit a control, with a touch target of at least 44 px by 44 px, that copies the Setup_Link.
8. WHEN the host activates the copy control and the clipboard write succeeds, THE Hunt_Setup_Screen SHALL show a plain-words confirmation next to that control for at least 2 seconds and no more than 5 seconds.
9. IF the clipboard write fails or the clipboard is unavailable, THEN THE Hunt_Setup_Screen SHALL show the Setup_Link as selectable text with a plain-words message that copying failed, and SHALL keep every Setup_QR unchanged.
10. THE Hunt_Setup_Screen SHALL make no network request when it builds a Setup_Link or a Setup_QR.
11. THE Hunt_Setup_Screen SHALL offer a print control with a touch target of at least 44 px by 44 px, and SHALL disable it whenever the controls that create, copy or print a Setup_Link are disabled.
12. WHEN the host prints, THE Print_Page SHALL show one QR_Card per Spirit in ascending order of the Spirit_Index, each with the Setup_QR, the text "Spirit N of M", the Spirit_Name, the Hunt_ID and, WHEN the Hide_At of that row is not empty, the text "Hide at: <Hide_At>", and SHALL draw each Setup_QR under the module rule of criterion 4.
13. WHEN the host prints and the Opening_Riddle is not empty, THE Print_Page SHALL show the Opening_Riddle as plain text of at least 24 CSS px at the top of the first page, above the first QR_Card.
14. THE Print_Page SHALL show dark text and dark modules on a white background, at a contrast ratio of at least 4.5:1, and SHALL NOT show any control.
15. WHEN the host prints, THE Print_Page SHALL keep each QR_Card whole on one page, so that no Setup_QR and none of its text is split across two pages.
16. WHEN the host prints, THE Print_Page SHALL use the same Setup_Links that the Hunt_Setup_Screen shows at that moment, so that no printed Setup_QR encodes an earlier Setup_Link.
17. IF the host activates the print control and the browser cannot open the print dialog, THEN THE Hunt_Setup_Screen SHALL show a plain-words message that printing failed and SHALL keep every Setup_QR and every typed value unchanged.

### Requirement 7: Beacon mode entry and screen

**User Story:** As a person hiding a phone, I want a scan to turn my phone into that Spirit's Beacon, so that I only need to tap once and hide it.

#### Acceptance Criteria

1. WHEN the Spirit_Box_App starts and the URL fragment decodes to valid Clue_Fields and the Clue_Builder returns a Clue_Packet for them, THE Spirit_Box_App SHALL show the Beacon_Screen instead of the Awaken_Screen, SHALL NOT request microphone access, and SHALL send no sound until the start control is tapped.
2. THE Beacon_Screen SHALL show the text "BEACON · Spirit N of M", where N is the Spirit_Index and M is the Spirit_Total.
3. THE Beacon_Screen SHALL show the Spirit_Name and the Hunt_ID as visible plain text, and SHALL NOT interpret either value as HTML.
4. WHILE the Beacon has not been started, THE Beacon_Screen SHALL show a start control with a touch target of at least 44 px by 44 px, SHALL send no sound, and SHALL NOT show the Clue_Text.
5. WHEN the user taps the start control, THE Spirit_Box_App SHALL run unlockAudio synchronously inside that tap handler before any asynchronous wait, and WHEN unlockAudio reports success, THE Spirit_Box_App SHALL start the Beacon and request the Wake_Lock (requirement 9.1).
6. IF unlockAudio fails or does not report success within 3000 ms of the tap, THEN THE Beacon_Screen SHALL stay on the start control, SHALL show the message "Audio could not start. Tap to try again.", SHALL send no sound, and SHALL accept another tap on the start control.
7. WHEN the Beacon starts, THE Spirit_Box_App SHALL begin the first screech within 1000 ms of the start tap, so that the person hiding the phone can confirm the sound.
8. WHILE the Beacon is running, THE Beacon_Screen SHALL show the Clue_Text as plain text, so that the person hiding the phone can check what the Beacon says.
9. THE Beacon_Screen SHALL NOT request microphone access, SHALL NOT open the Listen_Screen, and SHALL NOT open any URL found in the Clue_Text.
10. THE Beacon_Screen SHALL play no UI_Sound and no Haunting Sound, so that the only sound from the Beacon is the screech of the Clue_Packet.
11. WHILE the Beacon is running, THE Beacon_Screen SHALL show a stop control with a touch target of at least 44 px by 44 px, and WHEN the user holds that control for the Hold_Duration, THE Spirit_Box_App SHALL stop the Beacon using the Hold_State_Machine. A tap or a hold shorter than the Hold_Duration SHALL NOT stop the Beacon, so that a stray touch in a pocket or bag does nothing.
12. WHEN the Beacon stops, THE Spirit_Box_App SHALL release the Wake_Lock, cancel the Beacon_Schedule so that no further screech starts, show the start control, and hide the Clue_Text. IF a screech is playing at that moment, THEN THE Spirit_Box_App SHALL let that screech finish or cut it off within 500 ms, and SHALL NOT start another.
13. IF the Clue_Builder returns a Codec_Error for the fragment's Clue_Fields, THEN THE Spirit_Box_App SHALL show a plain-words message that names the field or cause (for `too-large`, in the form "Too heavy to cross over (<length>/140 bytes)"), SHALL NOT start a Beacon, SHALL NOT show a start control, and SHALL show a control, with a touch target of at least 44 px by 44 px, to open the normal app.
14. IF the Link_Decoder returns an error, THEN THE Spirit_Box_App SHALL show the plain-words error naming the wrong parameter, SHALL show a control, with a touch target of at least 44 px by 44 px, to open the normal app, and SHALL NOT start a Beacon.
15. WHEN the user activates the control to open the normal app from criterion 13 or 14, THE Spirit_Box_App SHALL show the Awaken_Screen and SHALL remove the Setup_Link fragment from the address bar without reloading the page.

### Requirement 8: Beacon schedule

**User Story:** As a Player, I want each Beacon to repeat its clue every 15 to 20 seconds, so that I can catch it as I walk by without Beacons talking over each other.

#### Acceptance Criteria

1. THE Beacon_Schedule SHALL return an integer number of milliseconds from 15000 to 20000 inclusive for every random value from 0 up to but not including 1.
2. THE Beacon_Schedule SHALL return 15000 for a random value of 0.
3. THE Beacon_Schedule SHALL return a value that does not decrease when the random value increases (monotonic property).
4. THE Beacon_Schedule SHALL perform no I/O, SHALL read no clock or random source, and SHALL return identical output for identical input, and THE Spirit_Box_App SHALL supply the random value from `Math.random` or `crypto.getRandomValues`.
5. IF the random value is not a finite number from 0 up to but not including 1, THEN THE Beacon_Schedule SHALL return 15000 and SHALL NOT throw.
6. WHEN the Beacon starts, THE Spirit_Box_App SHALL choose the time of the second screech as the start time of the first screech plus a Beacon_Interval from the Beacon_Schedule, using a clock timestamp.
7. WHILE the Beacon is running, THE Spirit_Box_App SHALL set the due time of each later screech to the start time of the previous screech plus a new Beacon_Interval, using a clock timestamp and not a count of timer ticks, so that the measured time from one screech start to the next is at least 15000 ms and, apart from criterion 8 and criterion 9, at most 20000 ms plus 250 ms of timer tolerance.
8. WHEN a screech is still playing at the time the next screech is due, THE Spirit_Box_App SHALL start the next screech within 250 ms after the playback ends, and SHALL NOT overlap two screeches.
9. WHEN the page becomes visible again and the next screech time has already passed, THE Spirit_Box_App SHALL start exactly one screech within 1000 ms of the page becoming visible, SHALL then choose the next due time as that screech's start time plus a new Beacon_Interval, and SHALL NOT send a burst to catch up.
10. WHEN the Beacon stops, THE Spirit_Box_App SHALL cancel every pending screech, SHALL start no screech after the stop, and SHALL show no Countdown.
11. IF the Clue_Builder returns an error when a screech is due, THEN THE Spirit_Box_App SHALL start no screech, SHALL show a plain-words message with the Clue_Builder's cause, and SHALL keep the schedule running so that the next due time is still chosen.
12. THE Spirit_Box_App SHALL encode every screech with the Clue_Builder and the Spirit_Wave protocol at the Transmit_Volume through the existing Audio_Engine, with no change to the Hunt_ID, Spirit_Index, Spirit_Total, Spirit_Name or Clue_Text between screeches, so that the bytes of every screech from one Beacon are identical.
13. WHILE the Beacon is running and no screech is playing, THE Beacon_Screen SHALL show the Countdown as text in the form "Next screech in N s", updated at least once per second.
14. WHILE a screech is playing, THE Beacon_Screen SHALL show the text "Screeching now" in place of the Countdown.
15. THE Countdown function SHALL be a pure function of the next-screech time and the current time, SHALL return a whole number of seconds from 0 to 20 inclusive for any next-screech time that is at most 20000 ms after the current time, rounding up, and SHALL return 0 when the next-screech time is not later than the current time.
16. WHILE Reduced_Motion is active, THE Beacon_Screen SHALL show the Countdown as updating text with an animation duration and a transition duration of 0 ms.

### Requirement 9: Keep the Beacon awake and audible

**User Story:** As a person hiding a phone, I want the phone to keep screeching for as long as the party lasts, so that the hunt does not stop when the screen would normally lock.

#### Acceptance Criteria

1. WHERE `navigator.wakeLock` is supported, WHEN the Beacon starts, THE Spirit_Box_App SHALL request a screen Wake_Lock, and WHEN the request is granted, THE Beacon_Screen SHALL show the text "Screen kept awake" within 1000 ms of the grant.
2. WHERE `navigator.wakeLock` is supported, WHEN the page becomes visible again after being hidden, IF the Beacon is still running and no Wake_Lock is held, THEN THE Spirit_Box_App SHALL request the Wake_Lock again, and THE Beacon_Screen SHALL show "Screen kept awake" again once the request is granted.
3. WHERE `navigator.wakeLock` is supported, WHEN the browser releases the Wake_Lock for any reason while the Beacon is running, THE Beacon_Screen SHALL replace the text "Screen kept awake" with a plain-words warning that the screen may lock, within 1000 ms of the release.
4. IF `navigator.wakeLock` is not supported, or the Wake_Lock request is rejected, THEN THE Beacon_Screen SHALL show a plain-words message that this phone may lock its screen and that the person hiding the phone should turn off auto-lock, SHALL continue the Beacon schedule without interruption, and SHALL NOT show an error screen.
5. WHILE the Beacon is running, THE Spirit_Box_App SHALL call ensureRunning before every screech and each time the page becomes visible.
6. IF the Audio_Context is not running when a screech is due and ensureRunning does not bring it to running within 1000 ms, THEN THE Spirit_Box_App SHALL start no screech, and THE Beacon_Screen SHALL show a plain-words message that the Beacon went quiet and a control labelled "Tap to wake the beacon" with a touch target of at least 44 px by 44 px.
7. WHEN the user taps the "Tap to wake the beacon" control, THE Spirit_Box_App SHALL call unlockAudio synchronously inside that tap handler before any asynchronous wait.
8. WHEN unlockAudio reports success after the tap in criterion 7, THE Spirit_Box_App SHALL start one screech within 1000 ms, SHALL hide the "went quiet" message and control, and SHALL resume the Beacon_Schedule with a new Beacon_Interval counted from that screech.
9. IF unlockAudio fails after the tap in criterion 7, THEN THE Beacon_Screen SHALL keep the "Tap to wake the beacon" control and the "went quiet" message, SHALL add the message "Audio could not start. Tap to try again.", and SHALL start no screech.
10. WHEN the Beacon stops or the Beacon_Screen is closed, THE Spirit_Box_App SHALL release the Wake_Lock if one is held, so that no Wake_Lock remains held after the stop.
11. THE Beacon_Screen SHALL show, as visible text while the Beacon is running, a plain-words instruction to raise the phone volume and to turn off the silent switch on iPhone.
12. WHEN the Spirit_Box_App prepares each screech, THE Spirit_Box_App SHALL read the sample rate from the Audio_Context at that moment and SHALL NOT use a hardcoded sample rate value.

### Requirement 10: Receiving a clue

**User Story:** As a Player, I want a heard clue to be spelled on the Ouija board and counted, and I want a Spirit I already found to leave me on the Listen_Screen, so that I know which Spirit I found, where to go next, and I can keep searching without being interrupted.

#### Acceptance Criteria

1. WHEN the Listen_Screen decodes a `hunt-clue` Packet that is not multipart, THE Spirit_Box_App SHALL pass the Payload text to the Clue_Parser.
2. IF the Listen_Screen decodes a multipart `hunt-clue` Packet, THEN THE Spirit_Box_App SHALL ignore it as it does today, SHALL NOT show an Action_Card, SHALL NOT call the Clue_Parser, and SHALL NOT change any Found_State or any screen.
3. WHEN the Clue_Parser returns Clue_Fields, THE Spirit_Box_App SHALL compute the Hunt_Intake and SHALL NOT show the plain Action_Card of `spirit-box-app` requirement 13.6 for that Packet.
4. WHEN the Clue_Parser returns Clue_Fields, THE Spirit_Box_App SHALL load the Found_State for that Hunt_ID, apply the Found_Reducer, and save the result through the Progress_Store before the Hunt_Reveal starts spelling, and SHALL show the Hunt_Reveal, the Hunt_Complete_Screen or the Already_Note within 500 ms of the decode.
5. WHEN the Hunt_Intake is `new`, THE Spirit_Box_App SHALL stop listening and show the Hunt_Reveal, which SHALL spell the Clue_Text on the Ouija_Spelling display, using the same spelling rules, skip control and Reduced_Motion behaviour as the Reveal_Screen, and SHALL then show the Spirit_Counter and the Follow_Line.
6. THE Hunt_Reveal SHALL show the Spirit_Name and the text "Spirit N of M" for the heard Clue_Packet, where N is the Spirit_Index (1 to M) and M is the Spirit_Total (3 to 7), and SHALL show them before the Ouija_Spelling starts.
7. IF the Clue_Parser returns a Codec_Error, THEN THE Spirit_Box_App SHALL show the garbled-message screen of `spirit-box-app` requirement 12.4, SHALL NOT change any Found_State, and SHALL NOT write to the Progress_Store.
8. WHEN the Hunt_Intake is `already`, THE Spirit_Box_App SHALL stay on the Listen_Screen, SHALL keep capturing, SHALL show the Already_Note above the K_II_Meter with the text "Already found · Spirit N of M · <name>", where `<name>` is the Spirit_Name stored in the Found_State at the first find, SHALL NOT run the Ouija_Spelling, SHALL play no sound, SHALL NOT change the Found_State, and SHALL NOT write to the Progress_Store.
9. THE Already_Note SHALL show the Read_Again_Control with a touch target of at least 44 px by 44 px, and WHEN the Player activates it, THE Already_Note SHALL show the full Clue_Text of the heard Clue_Packet as plain text within 100 ms, and the Listen_Screen SHALL keep capturing, so that a Player who lost the clue can read it again.
10. WHEN the heard Clue_Packet has identical bytes to the Packet whose Hunt_Reveal is currently on screen, THE Spirit_Box_App SHALL leave the Hunt_Reveal as it is, SHALL NOT restart the Ouija_Spelling, and SHALL NOT change the Spirit_Counter or the Found_State.
11. WHEN a Player taps the control to return to the Listen_Screen from the Hunt_Reveal, THE Spirit_Box_App SHALL resume listening within 1000 ms, and SHALL show no Already_Note until the next Clue_Packet is heard.
12. WHEN the Spirit_Box_App receives a Clue_Packet with identical bytes to one already handled, more than 5 seconds after that earlier Packet, THE Spirit_Box_App SHALL handle it by its Hunt_Intake as in criteria 5, 8 and 14, so that the 5-second suppression of `spirit-box-app` requirement 12.12 does not hide a Beacon repeat.
13. WHEN the Spirit_Box_App receives a Clue_Packet with identical bytes to one already handled, within 5 seconds of that earlier Packet, THE Spirit_Box_App SHALL ignore it, SHALL NOT change the Found_State, SHALL NOT start a new Hunt_Reveal, SHALL NOT call the Progress_Store, and SHALL leave any Already_Note on the Listen_Screen as it is.
14. WHEN the Hunt_Intake is `complete`, THE Spirit_Box_App SHALL stop listening and show the Hunt_Complete_Screen as in requirement 14.9, without running the Ouija_Spelling and without changing the Found_State.
15. WHEN the Already_Note appears, THE Spirit_Box_App SHALL announce its text once to assistive technology through a polite live region, and WHEN a repeat Clue_Packet for the same Spirit_Index arrives while the Already_Note is on screen, THE Spirit_Box_App SHALL leave the Already_Note, including any Clue_Text already shown, unchanged and SHALL NOT announce it again.
16. WHEN a Clue_Packet for a different found Spirit_Index arrives while an Already_Note is on screen, THE Spirit_Box_App SHALL replace the Already_Note with the one for that Spirit, SHALL hide any Clue_Text shown for the earlier Spirit, and SHALL announce the new note once. WHEN a Hunt_Intake of `new` or `complete` or a Codec_Error from the Clue_Parser arrives, THE Spirit_Box_App SHALL remove the Already_Note.
17. WHEN the Listen_Screen stops listening, THE Spirit_Box_App SHALL remove the Already_Note and SHALL discard the Clue_Text held for the Read_Again_Control, and THE Spirit_Box_App SHALL NOT save that Clue_Text in the Progress_Store or in any other storage.
18. THE Hunt_Reveal and THE Already_Note SHALL render the Spirit_Name and the Clue_Text as plain text, and SHALL NOT interpret them as HTML.
19. THE Spirit_Box_App SHALL open no URL when it shows a Hunt_Reveal or an Already_Note, SHALL NOT render a link in a Clue_Text as a link, and SHALL make no network request.
20. THE Hunt_Reveal and THE Already_Note SHALL play no UI_Sound.
21. IF the Spirit_Box_App hears a `hunt-clue` Packet while the Hunt_Reveal or the Hunt_Complete_Screen is on screen, THEN THE Spirit_Box_App SHALL NOT process it, because listening has stopped, and SHALL NOT change the Found_State.
22. WHILE the Already_Note is on screen, THE Already_Note SHALL render its text with a contrast ratio of at least 4.5:1 against its background, SHALL wrap long text onto further lines at every portrait width from 320 px to 430 px without horizontal scrolling, and SHALL NOT truncate the Spirit_Name or the Clue_Text.

### Requirement 11: Found-spirits state

**User Story:** As a Player, I want each Spirit counted once, so that the hunt ends exactly when I have found them all.

#### Acceptance Criteria

1. THE Found_Reducer SHALL be a pure function of the current Found_State, the Clue_Fields and a timestamp (integer milliseconds since the Unix epoch), SHALL return a new Found_State without changing the input, and SHALL read no clock, random source or storage.
2. WHEN the Found_Reducer receives Clue_Fields for a Spirit_Index not yet in the Found_State, and the Hunt_ID and Spirit_Total of the Clue_Fields match the Found_State, and the Found_State holds no time of completion, THE Found_Reducer SHALL add that Spirit_Index with its Spirit_Name to the Found_State.
3. WHEN the Found_Reducer receives Clue_Fields for a Spirit_Index already in the Found_State, THE Found_Reducer SHALL return a Found_State equal to the input (no double counting), and SHALL keep the Spirit_Name stored at the first find.
4. FOR ALL sequences of 0 to 50 Clue_Fields for one Hunt_ID and one Spirit_Total, THE number of found Spirits in the resulting Found_State SHALL equal the number of distinct Spirit_Index values in the sequence, and SHALL NOT exceed the Spirit_Total.
5. WHEN the Found_State holds 0 Spirits and the Found_Reducer adds the first one, THE Found_Reducer SHALL record the timestamp as the time of the first find.
6. WHEN the Found_Reducer adds a Spirit and the number of found Spirits becomes equal to the Spirit_Total, THE Found_Reducer SHALL record the timestamp as the time of completion, and SHALL record no time of completion while the count is smaller than the Spirit_Total.
7. FOR ALL sequences of 0 to 50 Clue_Fields for one Hunt_ID and one Spirit_Total, THE Found_State SHALL hold a time of completion if and only if the sequence holds every Spirit_Index value from 1 to the Spirit_Total (the Hunt completes exactly at the total).
8. WHILE the Found_State holds a time of completion, THE Found_Reducer SHALL return a Found_State equal to the input for any further Clue_Fields, so that the time of completion never changes.
9. IF the Hunt_ID of the Clue_Fields differs from the Hunt_ID of the Found_State, or the Spirit_Total of the Clue_Fields differs from the Spirit_Total of the Found_State, THEN THE Found_Reducer SHALL return a Found_State equal to the input.
10. WHEN the Found_Reducer receives Clue_Fields and the Found_State is empty for that Hunt_ID (no saved state), THE Found_Reducer SHALL be called with an empty Found_State that carries the Hunt_ID and Spirit_Total of the Clue_Fields, 0 found Spirits, and no recorded times.
11. FOR ALL pairs of Clue_Fields with different Spirit_Index values, THE Found_Reducer SHALL return the same set of found Spirit_Index values with their Spirit_Name regardless of the order in which the two arrive, apart from the recorded time of the first find and the time of completion (confluence property).
12. THE Time_Taken function SHALL return the time of completion minus the time of the first find, converted to whole seconds rounded down, and SHALL return 0 when the difference is negative.
13. IF the Found_State holds no time of completion or no time of the first find, THEN THE Time_Taken function SHALL return 0 and SHALL NOT throw.
14. THE Found_Reducer and THE Time_Taken function SHALL reside in `apps/web/src/logic` and import neither React nor any browser audio API.

### Requirement 12: Saved progress

**User Story:** As a Player, I want my finds saved, so that a reload or a locked phone does not lose the hunt.

#### Acceptance Criteria

1. WHEN the Found_State of a Hunt_ID changes, THE Progress_Store SHALL save it in `localStorage` under the key `screech.hunt.<Hunt_ID>` within 100 ms.
2. WHEN the Spirit_Box_App receives a Clue_Packet, THE Progress_Store SHALL load the Found_State saved for that Hunt_ID before the Found_Reducer runs.
3. THE Progress_Store SHALL keep the Found_State of each Hunt_ID separate, so that finds in one Hunt do not change another Hunt's Found_State.
4. FOR ALL valid Found_State values, loading the saved text of a Found_State SHALL return a Found_State equal to the original (round-trip property).
5. IF `localStorage` is unavailable, throws on read or write, or holds text that is not a valid Found_State for that Hunt_ID, THEN THE Progress_Store SHALL treat the Found_State as empty, SHALL keep the in-memory Found_State for the current session, SHALL NOT overwrite or delete the unreadable stored text until the next valid save for that Hunt_ID, and SHALL NOT show an error screen.
6. IF `localStorage` is unavailable or the save of a new find throws, THEN THE Hunt_Reveal SHALL show a plain-words note that progress will be lost when the page closes, and SHALL keep the Spirit_Counter and the in-memory Found_State unchanged.
7. WHEN a Player confirms the clear control in the Hunt_Reveal, THE Progress_Store SHALL remove the saved Found_State of the current Hunt_ID, and THE Spirit_Box_App SHALL reset the in-memory Found_State of that Hunt_ID to empty, so that the Hunt can be played again.
8. WHEN a Player activates the clear control, THE Hunt_Reveal SHALL show a confirmation step that names the Hunt_ID and the number of found Spirits that will be lost, and SHALL change no Found_State if the Player cancels or leaves the step without confirming.
9. THE Hunt_Reveal SHALL offer the clear control with a touch target of at least 44 px by 44 px.
10. IF removing the saved Found_State throws, THEN THE Hunt_Reveal SHALL show a plain-words message that the saved progress could not be cleared, and SHALL still reset the in-memory Found_State.
11. THE Progress_Store SHALL store only the Hunt_ID, Spirit_Total, found Spirit_Index values with their Spirit_Name, and the time of the first find and the time of completion, and SHALL NOT store any Clue_Text, Hide_At or Opening_Riddle.

### Requirement 13: Spirit counter

**User Story:** As a Player, I want to see how many Spirits I have found and which, so that I know how close I am to the end.

#### Acceptance Criteria

1. THE Spirit_Counter SHALL show the text "Spirits found: X of Y", where X is the number of Spirit_Index values in the Found_State (an integer from 0 to Y) and Y is the Spirit_Total (an integer from 3 to 7).
2. THE Spirit_Counter SHALL list the Spirit_Name of each found Spirit, one per line, ordered by ascending Spirit_Index, each preceded by its Spirit_Index.
3. THE Spirit_Counter SHALL show each Spirit_Index that is not yet found as an unfilled mark with the text "unknown", and SHALL NOT show the Spirit_Name or the Clue_Text of a Spirit that was not found.
4. THE Spirit_Counter SHALL show exactly Y entries, one for each Spirit_Index from 1 to Y, so that the number of found entries plus the number of "unknown" entries equals Y.
5. WHEN the Found_State changes, THE Spirit_Counter SHALL update its text and list within 100 ms.
6. WHEN the Hunt_Reveal starts spelling the Clue_Text, THE Spirit_Counter SHALL appear only after the Ouija_Spelling ends or is skipped, and SHALL show the Found_State that the Found_Reducer returned before the spelling began.
7. THE Spirit_Counter SHALL expose its text to assistive technology as one text value in the form of criterion 1 followed by the list of criterion 2, and SHALL NOT announce each name separately while the Ouija_Spelling is in progress.
8. IF the Spirit_Name of a found Spirit is longer than the width of the counter at a 320 px viewport, THEN THE Spirit_Counter SHALL wrap the name onto further lines and SHALL NOT truncate it or cause horizontal scrolling.
9. WHILE Reduced_Motion is active, THE Spirit_Counter SHALL appear and update with an animation duration and a transition duration of 0 ms.
10. THE Spirit_Counter SHALL mark each Spirit with a filled shape and its Spirit_Name for found, and an unfilled shape and the text "unknown" for not found, so that the two states differ by shape and text and not by colour alone.
11. THE Spirit_Counter SHALL render each Spirit_Name as plain text and SHALL NOT interpret it as HTML.
12. THE Spirit_Counter SHALL render its text with a contrast ratio of at least 4.5:1 against its background.
13. WHEN the Spirit_Counter appears on the Hunt_Reveal, THE Hunt_Reveal SHALL show the Follow_Line "Follow the K-II meter. More lights, closer spirit." as one static line of plain text under the Spirit_Counter, with a contrast ratio of at least 4.5:1 against its background, and SHALL show it with no animation, no colour change and no sound.

### Requirement 14: Hunt complete

**User Story:** As a Player, I want a finish screen with my time, so that the hunt ends with a payoff.

#### Acceptance Criteria

1. WHEN the Found_Reducer returns a Found_State with a time of completion that the previous Found_State did not hold, THE Spirit_Box_App SHALL show the Hunt_Complete_Screen after the Hunt_Reveal of the last Spirit ends or the Player skips it, and SHALL NOT show the Hunt_Complete_Screen before then.
2. THE Hunt_Complete_Screen SHALL show the text "Hunt complete".
3. THE Hunt_Complete_Screen SHALL show the Time_Taken in the form `M:SS`, where M is a whole number of minutes with no upper limit and no leading zero, and SS is the remaining seconds from 00 to 59 with a leading zero.
4. THE Hunt_Complete_Screen SHALL show the Spirit_Name of every Spirit in the Found_State, ordered by Spirit_Index from 1 to the Spirit_Total, each with its Spirit_Index.
5. THE Hunt_Complete_Screen SHALL show the Hunt_ID and the text "Spirits found: Y of Y", where Y is the Spirit_Total.
6. THE Hunt_Complete_Screen SHALL offer a control labelled to return to the Speak_Screen and a control labelled to start the Hunt over, each with a touch target of at least 44 px by 44 px.
7. WHEN the Player activates the control to return to the Speak_Screen, THE Spirit_Box_App SHALL show the Speak_Screen and SHALL leave the Found_State unchanged.
8. WHEN the Player activates the control to start the Hunt over, THE Spirit_Box_App SHALL ask for confirmation using the confirmation step of requirement 12.8, and WHEN the Player confirms, THE Spirit_Box_App SHALL clear the Found_State of the current Hunt_ID as in requirement 12.7 and show the Listen_Screen, and WHEN the Player declines, THE Spirit_Box_App SHALL keep the Hunt_Complete_Screen and the Found_State unchanged.
9. WHEN the Spirit_Box_App loads a Found_State that already holds a time of completion and the Listen_Screen decodes a Clue_Packet of that Hunt_ID, THE Spirit_Box_App SHALL treat the Hunt_Intake as `complete` whatever the Spirit_Index, SHALL show the Hunt_Complete_Screen with the saved Time_Taken instead of the Already_Note, SHALL NOT start the Ouija_Spelling, and SHALL NOT change the time of completion.
10. IF the Found_State of the Hunt_ID cannot be loaded because the Progress_Store treats it as empty (requirement 12.5), THEN THE Spirit_Box_App SHALL treat the Clue_Packet as the first find and SHALL NOT show the Hunt_Complete_Screen from stored data.
11. THE Hunt_Complete_Screen SHALL play no UI_Sound and SHALL show no animation or effect other than ones driven by a Found_State value (the found count, the Time_Taken or the Spirit_Index list).
12. WHILE Reduced_Motion or the Exorcise_Toggle is active, THE Hunt_Complete_Screen SHALL appear with an animation duration and a transition duration of 0 ms.
13. THE Hunt_Complete_Screen SHALL use phosphor green for the "Hunt complete" text, SHALL use bone white for body text with a contrast ratio of at least 4.5:1 against its background, and SHALL use blood red only for curses, errors and the seal.

### Requirement 15: Theme, accessibility and platform

**User Story:** As a user on any phone or laptop, I want Ghost Hunt to look and behave like the rest of Screech, so that the game feels part of the same haunted box.

#### Acceptance Criteria

1. THE Hunt_Setup_Screen, THE Beacon_Screen, THE Hunt_Reveal, THE Already_Note and THE Hunt_Complete_Screen SHALL use the colour tokens, fonts and copy voice defined in `spirit-box-app` requirement 2, and SHALL show blood red only for curses, errors and the seal.
2. THE Hunt_Setup_Screen, THE Beacon_Screen, THE Hunt_Reveal, THE Already_Note and THE Hunt_Complete_Screen SHALL lay out with no horizontal scrolling (document scroll width not greater than viewport width) at every portrait viewport width from 320 px to 430 px inclusive.
3. THE Hunt_Setup_Screen SHALL lay out with no horizontal scrolling at a viewport width of 1280 px.
4. THE Spirit_Box_App SHALL give every Ghost Hunt control a touch target of at least 44 px by 44 px.
5. THE Spirit_Box_App SHALL render all Ghost Hunt text with a contrast ratio of at least 4.5:1 against its background.
6. WHILE Reduced_Motion is active or the Exorcise_Toggle is on, THE Spirit_Box_App SHALL show every Ghost Hunt screen and the Already_Note with a computed animation duration of 0 ms and a computed transition duration of 0 ms.
7. THE Spirit_Box_App SHALL NOT flash any Ghost Hunt element more than 3 times in any 1-second period.
8. THE Spirit_Box_App SHALL use no emoji in Ghost Hunt text, no gradient washes and no flashlight-cursor effect.
9. THE Spirit_Box_App SHALL tie every Ghost Hunt visual or audio effect to one of these state values: Countdown, Clue_Packet_Size, Found_State, or K_II_Meter energy.
10. IF an error occurs in Ghost Hunt, THEN THE Spirit_Box_App SHALL show a message that states in plain words what happened, SHALL include the measured value and the limit in the form `<value>/<limit>` where a numeric limit applies, and SHALL keep all entered data unchanged.
11. THE Spirit_Box_App SHALL run Ghost Hunt over HTTPS in the latest stable release of iOS Safari, Chrome on Android and Chrome on desktop.
12. THE Spirit_Box_App SHALL create or resume the Audio_Context only inside `unlockAudio` called from a tap handler, or inside `ensureRunning`, as in `spirit-box-app` requirement 16.2.
13. THE Spirit_Box_App SHALL compile Ghost Hunt code with `tsc` in strict mode with 0 errors and 0 occurrences of the `any` type.
14. THE Spirit_Box_App SHALL make 0 network requests to any origin other than its own for Ghost Hunt, including fonts, scripts and QR generation.

### Requirement 16: Tests

**User Story:** As a maintainer, I want property tests and unit tests for the pure Ghost Hunt logic, so that regressions are caught by `pnpm test`.

#### Acceptance Criteria

1. THE Core test suite SHALL include a fast-check property that, for any valid Clue_Fields whose Clue_Packet fits `SIZE_CAP`, the Clue_Parser returns the original Clue_Fields from the Payload text that Core `decode()` returns for the Clue_Packet (round trip).
2. THE Core test suite SHALL include a fast-check property that, for any Clue_Fields including invalid ones, the Clue_Builder returns either a Clue_Packet of at most 140 bytes or a Codec_Error and never throws.
3. THE Core test suite SHALL include a fast-check property that, for any input value of any type, the Clue_Parser returns either Clue_Fields or a Codec_Error and never throws.
4. THE Core test suite SHALL include a fast-check property that, for identical Clue_Fields, the Clue_Builder returns byte-for-byte identical Packets.
5. THE Core test suite SHALL include unit tests for the Clue_Builder and the Clue_Parser with fixed example values, covering the following cases:
   - each error field (`huntId`, `total`, `index`, `name`, `clue`), each asserted by its Codec_Error code and field;
   - a Clue_Packet of exactly 140 bytes that the Clue_Builder accepts;
   - a Clue_Packet of 141 bytes that the Clue_Builder rejects with `too-large` and the computed length 141;
   - a Spirit_Name of exactly 24 UTF-8 bytes that is accepted, and a Spirit_Name of 25 UTF-8 bytes that is rejected with field `name`;
   - a multi-byte character in the Spirit_Name and in the Clue_Text;
   - a control character in the Spirit_Name and in the Clue_Text that is replaced by a single space.
6. THE Spirit_Box_App test suite SHALL include a fast-check property that, for any valid Clue_Fields whose Clue_Packet fits `SIZE_CAP`, the Link_Decoder returns the original Clue_Fields from the fragment of the Setup_Link that the Link_Encoder returned (round trip).
7. THE Spirit_Box_App test suite SHALL include a fast-check property that the Link_Decoder returns either Clue_Fields or an error and never throws for any input string, and unit tests for an empty fragment, a fragment with a missing parameter, a fragment with a duplicated parameter, a fragment with malformed percent-encoding, and a fragment with the five parameters in a different order.
8. THE Spirit_Box_App test suite SHALL include fast-check properties for the Found_Reducer that check:
   - no double counting (the count equals the number of distinct Spirit_Index values and never exceeds the Spirit_Total);
   - completion exactly at the total (a time of completion exists if and only if all Spirit_Index values from 1 to the Spirit_Total were seen);
   - a repeated Clue_Fields value leaves the Found_State unchanged;
   - the confluence property of requirement 11.11;
   - the input Found_State is not changed.
9. THE Spirit_Box_App test suite SHALL include unit tests for the Found_Reducer and the Time_Taken function covering the first-find timestamp, the completion timestamp, a different Hunt_ID, a different Spirit_Total, further Clue_Fields after completion, and a Time_Taken of 0 for a negative difference.
10. THE Spirit_Box_App test suite SHALL include fast-check properties for the Beacon_Schedule that check the result is an integer from 15000 to 20000 inclusive for every random value from 0 up to but not including 1, and that the result does not decrease as the random value increases, and unit tests at random values 0, 0.5, the largest number below 1, `NaN`, 1 and -1.
11. THE Spirit_Box_App test suite SHALL include a fast-check property for the Countdown function that checks the result is a whole number from 0 to 20 inclusive for any next-screech time within 20000 ms after the current time, and unit tests for a next-screech time that equals the current time, precedes it and follows it by 1 ms and by 20000 ms.
12. THE Spirit_Box_App test suite SHALL include a fast-check property for the Hunt_ID generator (6 characters, all in the Hunt_Alphabet) and a fast-check property for the Progress_Store round trip of the Found_State, and unit tests for the Progress_Store covering unavailable `localStorage`, text that is not a valid Found_State, and separate keys for two Hunt_ID values.
13. THE Spirit_Box_App test suite SHALL include a fast-check property and a unit test that every built-in Riddle_Pack entry and every Finale_Line builds a Clue_Packet of at most 90 bytes at every Spirit_Index from 1 to the Spirit_Total and at every Spirit_Total from 3 to 7, that every built-in text is ASCII only, and that every pack holds one Opening_Riddle, 7 entries and one Finale_Line within the limits of requirement 3.8.
14. THE Spirit_Box_App test suite SHALL include a fast-check property that the Airtime_Function returns an integer that does not decrease as `packetBytes` increases from 1 to 140 and never throws, and unit tests that the Airtime_Function is within 1 second of 2.3 s for 26 bytes, of 4 s for 53 bytes and of 9.3 s for 140 bytes.
15. THE Spirit_Box_App test suite SHALL include fast-check properties for the Hunt_Setup_Screen draft logic that check:
   - filling a pack for any Spirit_Total from 3 to 7 puts the Finale_Line on row M and on no other row, puts entries 1 to M-1 on rows 1 to M-1, and sets the Opening_Riddle;
   - changing the Spirit_Total with an Applied_Pack and no Custom_Text gives the same rows as filling that pack for the new Spirit_Total, and changing it with Custom_Text leaves every row unchanged;
   - two drafts that differ only in Hide_At or Opening_Riddle produce byte-for-byte identical Clue_Packets and identical Setup_Links.
16. THE Spirit_Box_App test suite SHALL include a fast-check property that the Hunt_Intake is `new` exactly when the Spirit_Index was not found and the Found_State holds no time of completion, `already` when the Spirit_Index was found and the Found_State holds no time of completion, and `complete` when the Found_State holds a time of completion, and unit tests that an `already` Hunt_Intake changes no Found_State and writes nothing to the Progress_Store.
17. THE Core test suite and THE Spirit_Box_App test suite SHALL configure each fast-check property to run at least 100 generated cases.
18. WHEN `pnpm test` runs from the repository root and every Ghost Hunt test passes, THE `pnpm test` command SHALL run the Ghost Hunt tests, report 0 failed tests and exit with code 0.
19. IF any fast-check property fails, THEN THE `pnpm test` command SHALL exit with a non-zero code and report the counterexample and the seed.
20. IF a Ghost Hunt module named in requirements 4, 5, 8 or 11 imports React or a browser audio API, THEN THE existing check for that rule SHALL fail the `pnpm test` run, exit with a non-zero code and name the module.

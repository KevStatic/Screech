# checkin-api

The Séance check-in API for Screech. It is a set of Netlify Functions that keep their data in Netlify Blobs. A host creates a séance, attendees check in with a rolling code they heard as a screech, and the host reads the list.

The package is `@screech/checkin-api`. Its handlers use `@screech/core` for validation and for rolling-code verification, so no protocol logic lives here.

## Endpoints

All bodies are JSON. Every response is `application/json` with `Cache-Control: no-store`, and none sets a cookie. Errors have the shape `{ "error": "<plain-words message>" }`. A request with the wrong method gets 405 with an `Allow` header. A request body over 2048 bytes gets 413. A body that is not valid JSON gets 400.

Host-only endpoints take `Authorization: Bearer <hostSecret>`.

A session ID is 8 characters from the Hunt alphabet. A malformed ID, an unknown ID, an expired séance and a wrong or missing host secret all return the same 404 (`This séance was not found. It may be over.`), so a caller cannot tell them apart.

### POST /api/seance

Creates a séance.

- Input: `{ "title": string }`. The title must be 1 to 60 characters, otherwise 400.
- Output 201: `{ "sessionId": string, "title": string, "hostSecret": string }`. The `hostSecret` is 43 base64url characters and is returned only here.
- Output 503 if no unused session ID could be found after 10 tries.

### GET /api/seance/:id/public

Read-only. Tells a joining device whether the séance exists and is open.

- Input: none.
- Output 200: `{ "title": string, "open": boolean }`.
- Output 404 as described above.

### GET /api/seance/:id

Host-only. Returns the check-in list.

- Input: the `Authorization` header.
- Output 200: `{ "title": string, "open": boolean, "checkIns": [{ "name": string, "at": string }] }`. `at` is a UTC ISO 8601 time. Device IDs are never returned.
- Output 404 for a missing, wrong or malformed secret, or an unknown séance.

### POST /api/seance/:id/checkin

Records one check-in.

- Input: `{ "name": string, "deviceId": string, "code": string }`. The name must be 1 to 32 characters. `deviceId` is 32 lowercase hex characters. `code` is the rolling code from the screech.
- Output 200: `{ "name": string, "at": string, "alreadyCheckedIn": boolean }`. A repeat `deviceId` gets its stored record back with `alreadyCheckedIn: true`, even after the séance has ended or the code has changed.
- Output 400 for a bad field. The message names the field.
- Output 403 if the code is not valid at the server's time (`That code has expired...`).
- Output 410 if the séance has ended and this device had not checked in.
- Output 404 as described above.

The server clock decides the check-in time. The client never supplies one.

### POST /api/seance/:id/end

Host-only. Ends the séance. Calling it again changes nothing.

- Input: the `Authorization` header. No body is needed.
- Output 200: `{ "ended": true, "count": number }`, where `count` is the number of check-ins.
- Output 404 for a missing, wrong or malformed secret, or an unknown séance.

An ended séance stays readable by the host and by `/public` until it expires.

All endpoints return 500 with `The spirits stumbled. Try again.` on an unexpected failure. The message carries no stack trace or stored value.

## Storage

Data lives in two Netlify Blobs stores. Names and key builders are in `src/seance.ts`.

| Store | Key | Value |
| --- | --- | --- |
| `seance-sessions` | `session:<sessionId>` | `{ sessionId, title, hostSecret, createdAt, ended }` |
| `seance-checkins` | `checkin:<sessionId>:<deviceId>` | `{ name, deviceId, at }` |

Each check-in has its own key and is written with `onlyIfNew`. When many requests carry the same device ID at once, exactly one write wins and the rest read back the stored record. There is no lock and no shared list to overwrite.

A séance lives for 24 hours from `createdAt`. After that the store treats it as missing.

## Cleanup function

`netlify/functions/seance-cleanup.ts` is a scheduled function (`@hourly`). It calls `runCleanup` in `src/seance-cleanup.ts`, which lists every séance and deletes each one that is 24 hours old or more, along with all of its check-ins. Open and ended séances under 24 hours old are kept. Cleanup never runs from request handling.

## Layout

```
apps/checkin-api/
  netlify/functions/   entry files, one per endpoint, plus the cleanup schedule
  src/                 handlers, store and shared helpers
  tests/               Vitest and fast-check tests
```

Entry files hold no logic. Each one creates `createBlobsStore({ now: () => Date.now() })`, passes `() => Date.now()` as the clock, and calls the handler in `src/`. The route and method are set in each entry's `config`, not in a redirect.

| Entry file | Handler | Route |
| --- | --- | --- |
| `seance-create.ts` | `handleCreate` | `POST /api/seance` |
| `seance-public.ts` | `handlePublic` | `GET /api/seance/:id/public` |
| `seance-host.ts` | `handleHost` | `GET /api/seance/:id` |
| `seance-checkin.ts` | `handleCheckin` | `POST /api/seance/:id/checkin` |
| `seance-end.ts` | `handleEnd` | `POST /api/seance/:id/end` |
| `seance-cleanup.ts` | `runCleanup` | schedule `@hourly` |

Other files in `src/`: `http.ts` (response helpers, body reading, constant-time compare), `seance.ts` (types, store names, keys, expiry) and `seance-store.ts` (the `SeanceStore` interface, an in-memory store for tests, and the Blobs-backed store).

`netlify.toml` at the repository root sets the build, the functions directory and the `[dev]` block. It has no `/api/*` redirect.

## Tests

From the repository root:

```
pnpm test
```

Handler tests use the in-memory store and an injected clock. They make no network calls and never touch the real Blobs store, so no Netlify credentials are needed.

## Local development on phones

The web app and the functions must share one origin, so the browser uses relative `/api/...` URLs and no CORS setup is needed. Phones also need HTTPS for the microphone. A tunnel gives both.

1. From the repository root, run `pnpm dev` (it runs `netlify dev --filter @screech/web`, so Netlify does not ask which project to use). It starts the web dev server (port 5173) and the functions behind one address, `http://localhost:8888`.
2. In a second terminal, run `cloudflared tunnel --url http://localhost:8888`. It prints an HTTPS URL on `trycloudflare.com`.
3. Open that HTTPS URL on the laptop. This is the Host_Screen.
4. Open the same HTTPS URL on each phone. This is the Listen_Screen.

Use the tunnel URL on every device, including the laptop. Opening `localhost:8888` on the laptop and the tunnel URL on the phones gives two origins, and the device ID and session storage will not match.

Under `netlify dev` the web dev server runs over plain HTTP, because the tunnel supplies the HTTPS. Running `pnpm --filter @screech/web dev` on its own keeps its self-signed HTTPS, but it does not serve the functions.

## Telling a functions failure from an app failure

When a check-in or a poll fails, first ask the public endpoint directly, outside the app:

```
curl -i https://<your-origin>/api/seance/<sessionId>/public
```

- A JSON response means the functions are running. A 200 or a 404 with the `séance was not found` message is a normal answer. If the app still fails, the fault is in the app (the client code, the origin, the request it builds).
- An HTML page, a Netlify 404 page, a 502 or a timeout means the functions are not being reached or are crashing. The fault is in the functions or the routing.

To dig further, read the function logs. Under `netlify dev` they print in the terminal that runs it. On a deployed site, open the site's Functions tab in the Netlify dashboard and look at the log for the function that served the request. A 500 with `The spirits stumbled. Try again.` always means the handler threw. The reason is in that log, not in the response.

Also check that the app and the request share one origin. A request to a different host fails in the browser before it reaches the functions, and shows up in the browser's network panel but not in the function logs.

/**
 * Where the app looks for the API.
 *
 * The single most common first-day wall in mobile development: `localhost`
 * means *the phone*, not your Mac. A backend on `localhost:3001` is
 * unreachable from a physical device, and the failure surfaces as a bare
 * "Network request failed" with nothing else to go on.
 *
 * Three ways to point this somewhere real:
 *
 *   1. Production (the default below). Already deployed, nothing to run.
 *      Note it is on Render's free plan, so the first request after ~15
 *      minutes of idle pays a cold start — measured at 21 s on 2026-09-22.
 *      That is the server waking, not your code being slow.
 *
 *   2. Your Mac over the LAN. Find the address with:
 *        ipconfig getifaddr en0
 *      then use `http://<that-address>:3001`. Phone and Mac must be on the
 *      same network, and the backend must be listening on 0.0.0.0 rather
 *      than 127.0.0.1.
 *
 *   3. The iOS simulator only, where `http://localhost:3001` does work,
 *      because the simulator shares the host's network stack. An Android
 *      emulator needs `http://10.0.2.2:3001` instead.
 */
export const API_URL = 'https://mindgo.onrender.com';

/** The free-tier cold start is real, so give requests room before giving up. */
export const REQUEST_TIMEOUT_MS = 60_000;

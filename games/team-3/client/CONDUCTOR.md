# Conductor announcements (#32)

`createConductor(container, optionalService)` displays short announcements for each new
hazard and the crossing into low fuel. Pass each authoritative room snapshot to
`update(state)`; call `dispose()` when leaving. The hand-check client connects its demo
state now; the multiplayer client must connect room patches when #12 is available.

Warnings appear immediately using built-in conductor wording. An optional AI service
can replace a single warning, without blocking a game tick. Timeout after two seconds,
HTTP errors, invalid responses and missing configuration keep the fallback. Responses
from previous hazards, ended runs or disposed views are ignored. Multiple simultaneous
warnings appear together. Messages expire after eight seconds and use textContent.

To enable a deployed service, supply
`createAnnouncementService('/your-proxy-route')` from `conductorService.ts` to `createConductor`.
The same-origin proxy accepts POST `{kind:'lowFuel'}` or
`{kind:'hazard',hazard:'fire'|'breach'|'course',car:number}` and returns
`{text:string}` (1–240 characters). The platform must implement/configure this route,
keep provider credentials in server environment variables, and rate-limit requests.
No provider is selected, no endpoint is called by default, and no API key is shipped
in the browser or repository. Live AI generation has not been verified without that
service; all gameplay and fallback announcements work without it.

Tests cover transition deduplication, refuelling, lobby suppression, provider failures,
timeouts, and stale response suppression. Run `npm test`, `npm run typecheck`,
`npm run build` from games/team-3.

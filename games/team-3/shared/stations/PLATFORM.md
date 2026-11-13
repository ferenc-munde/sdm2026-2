# Platform objects (#153)

`platform.ts` supplies the waiting platform's departure lever, practice coal and
boiler, practice wrench/breach and proximity board rules. All positions come from
`PlatformObjectLayout`, to be mapped from #148's platform map. No coordinates are
hard-coded in the implementation.

The server keeps `PlatformPractice` beside the lobby state, separately from the
real journey. Initialise it once per waiting room with `createPlatformPractice`.
Call `usePracticeObject` once per pick-up/action request and `stepPlatformPractice`
on each lobby tick, using the authoritative lobby player positions and held-input
flags. Station actions run before generic pickup/drop. Practice reuses the tested
coal, item and breach rules in an isolated world; do not register journeySystem or
the director against it. Boiler fuel is practice-only and capped at 100. Repair
requires the wrench for 3 seconds; letting go resets progress. After completion
the practice breach returns in 5 seconds. Disconnection returns held practice
items to their starting stations so the wrench cannot become inaccessible.

Render `platformPracticeView(lobby, practice, layout)` and show practice.boilerFuel
on the practice boiler if desired. It uses lobby player positions, practice item
ownership, and the practice breach; it retains the real journey unchanged.
Discard practice state on departure; the #148 start rule owns real run inventory
and train spawns.

`useDepartureLever(session, lobby, hostId, playerId, layout, rules)` checks range,
connected status and host identity, delegates crew completeness to #148's
`canDepart`, then calls its start rule. Adapt that rule's result to
`{ok:true,session}` / `{ok:false,session,message}`. Return messages to the requesting
player. Do not call the older unrestricted startSession directly from the lever.

Mount `createPlatformBoard(container)` from client/platformBoard.ts alongside
#146's waiting platform, then call update(lobby, localPlayerId, layout) on each
room patch. It automatically displays the goal and controls when near a board;
walking away, disconnecting or departing hides it. No movement keys are captured.
The existing #26 How to play button should stay mounted too.

Tests cover host-only/crew-complete/range departure, practice coal and journey
isolation, wrench requirements/reset, five-second respawn, disconnection and board
proximity. `createPlatformLobby`, `stepPlatformLobby`, `usePlatformAction` and
`platformLobbyView` in `run/boarding.ts` now connect these rules to #148's map,
movement and boarding functions. The room owns that combined object, calls its tick
and action functions, and syncs the returned view. #146 can render it without
recreating platform rules.

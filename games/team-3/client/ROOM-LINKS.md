# Joining from a shared link (#147)

At the main-menu entry point (#12), call `createSharedLinkJoin(container, options)`
from `sharedLinkJoin.ts` before mounting the regular menu. Pass the page's
`window.location.href` as `address`. A valid `?room=K7QF` opens the name-only join
screen automatically; no code input is needed. No query means the ordinary menu.

Supply `join(name, code)` using the #145 transport. Resolve `{ok:true}` after the
server's `joined` acknowledgement, or `{ok:false,error:message.code}` for an error.
Do not resolve success merely because a socket opened or the request was sent.
`onJoined` mounts the waiting platform; `onMainMenu(message)` mounts the main menu
and displays the supplied error. Invalid, expired, full and departed rooms have
clear messages. Connection errors also return to the menu; double submission and
late replies after cancellation are ignored. Dispose the prompt when navigating.

For the waiting room's Copy link button (#146), copy
`buildRoomLink(window.location.href, state.roomCode)` from `roomLinks.ts`.
The helper keeps the current origin/path and other query options; it replaces old
room codes and removes the fragment, so localhost and /team-3/ work alike.

The existing examples and design use four alphanumeric room codes. The code format
is isolated in normalizeRoomCode if #145 establishes another format.

The main menu and temporary server are not on Team_3_Feature yet. This component
provides their tested link parsing and join-screen integration point; live joining
cannot be verified until #12/#145 are connected. Keep #147 open until then.

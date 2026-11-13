# How to play — #26

The always-available How to play button opens a native modal with the objective,
coal, repair, extinguishing and controls. The native dialog manages focus and
Escape; keyboard events inside it do not reach gameplay listeners. Control hints
are visible in the demo game and hidden on end screens.

The current client still has no real lobby (#12). Keep this component mounted
beside the lobby and call `help.update(state.phase)` on room state changes. The
button is visible for both lobby and playing phases. #26 stays open until that
lobby integration is verified; this PR supplies the working screen and hints.

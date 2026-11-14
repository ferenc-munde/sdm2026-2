# Play-test fixes (#27)

The #125 review and main-menu integration identified three concrete help-screen bugs:
- Ending a run with help open left the modal above the result screen. Phase updates
  now close it, without focusing the hidden help button.
- Opening help while movement/interact was held left those inputs active until
  keyup. Keyboard.reset() now emits idle before the modal opens.

- The new lobby covered the How to play button (lobby z-index 20, button 12).
  The button now sits above menu overlays so help is reachable from the lobby.

Regression tests cover input and modal state, including no duplicate idle packets and focus return
on normal close. These are local acceptance checks, not a claim that a three-person
online play-test happened. That session still depends on #145/#146/#148.

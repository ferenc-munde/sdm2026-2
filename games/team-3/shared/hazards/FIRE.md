# Fire — #17

`stepFires(state, interactions, dt)` requires a held extinguisher and 2.5 seconds
of held interact within range. It preserves the tool and resets on release.
Engine fire stalls the train; extinguishing restores the fuel-derived speed.

The journey owns all continuous damage. Add `fireSystem` AFTER `journeySystem`
to the session systems. Do not subtract fire damage in any other system.
The helper accepts server-maintained held input, never client progress.

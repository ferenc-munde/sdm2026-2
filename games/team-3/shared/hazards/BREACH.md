# Breach rules — #16

Call `stepBreaches(state, interactions, dt)` once per server tick during play.
Interactions are server-maintained held-interact inputs keyed by player ID.
The function returns a new state and does not mutate its input.

This function owns breach hull damage; the journey must not subtract it again.
Run it before journey movement; the run owner still handles win/loss.

Room and journey wiring are absent in this snapshot and remain integration work.

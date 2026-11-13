# Breach repair — #16

`stepBreaches(state, interactions, dt)` handles wrench repair and removes completed
breaches. Repair takes three seconds; releasing interact resets progress. The
wrench is kept. Only connected players holding the wrench within 40 units qualify.

The journey system owns ALL continuous hull damage. Run `journeySystem` before
`breachSystem` in the session systems list so active breaches damage once per tick.
`breachSystem` adapts the session held-input shape automatically. This deliberately
charges the final repair tick, at most 0.125 hull at 20 Hz.

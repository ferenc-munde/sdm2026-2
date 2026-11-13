# Fire spread — #30

Enable `fireSpreadSystem(map.hazardSpots)` AFTER `fireSystem` in the session
systems list. fireSystem advances fire age once. When a fire reaches 15 seconds,
spreadFires starts a fire on the nearest unoccupied map spot and resets the source
spread clock. Ties use spot id; multiple sources reserve spots in id order.
New fires cannot cascade in the same step. With no free spot, the source waits.
The function does not add hull damage; journeySystem remains its only owner.
This optional rule should be enabled only after the core game is integrated.

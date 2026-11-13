# Course hazard — #28 (rules)

Call `startCourse(state, spot)` when the room/director triggers a course event.
It publishes a course hazard with a five-second countdown. Pass the server map's
steering console to `courseSystem(console)` in the session systems list.
Holding interact continuously for the last two seconds prevents the hit;
otherwise the hull loses 12 once. No held tool is required.

Main-66 owns the on-screen warning. Render the course hazard's `countdown` and
`progress` from room state. This rules PR keeps #28 open until the warning and
room trigger are connected. Enable this stretch feature after core integration.

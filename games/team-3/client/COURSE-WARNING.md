# Course countdown (#28 follow-up)

The rule and 45-second trigger are already merged (#127/#136). This adds the
visible warning/countdown requested by #28, plus the authoritative hold-progress
bar. It highlights the final two seconds and explains the 12-hull miss penalty.

Mount createCourseWarning(container) once and call update(state) for each server
patch. The demo entry point is connected; it normally has no course hazards, so
nothing is displayed there until a course state is supplied. The renderer/lobby
integration must preserve this update call when #19/#12 replace the demo state.
No browser timer independently advances or resolves hazards. End phases and hazard
removal hide the warning. Tests cover server countdown, progress/reset and hiding.

Main-66 should review the warning presentation. Connect the actual room pipeline
(#145) to complete online verification; do not mark #28 play-tested from this demo.

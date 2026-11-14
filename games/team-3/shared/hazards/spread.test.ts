import { expect, it } from "vitest";
import { makeState } from "../run/testState.ts";
import { spreadFires } from "./spread.ts";
const spots = [0, 20, 60].map((x, car) => ({ id: `s${car}`, car, position: { x, y: 0 } }));
function setup(age: number) { const s=makeState(); s.hazards.f={id:"f",kind:"fire",spotId:"s0",car:0,position:{x:0,y:0},age,progress:0,countdown:null};return s; }
it("spreads at 15 seconds to the nearest free spot", () => {
 const s=setup(15);const n=spreadFires(s,spots);
 expect(Object.values(n.hazards).map(h=>h.spotId)).toEqual(["s0","s1"]);
 expect(s.hazards.f!.age).toBe(15);expect(n.hazards.f!.age).toBe(15);expect(n.hazards.f!.nextSpreadAt).toBe(30);
});
it("does not spread before 15 seconds or without a free spot",()=>{
 expect(Object.keys(spreadFires(setup(14.99),spots).hazards)).toHaveLength(1);
 expect(Object.keys(spreadFires(setup(15),spots.slice(0,1)).hazards)).toHaveLength(1);
});
it("does not cascade new fires or spread outside play",()=>{
 const s=setup(30);expect(Object.keys(spreadFires(s,spots).hazards)).toHaveLength(2);
 s.phase="won";expect(spreadFires(s,spots)).toBe(s);
});

it("does not spread a fire while it is being extinguished",()=>{const s=setup(15);s.hazards.f!.progress=0.4;expect(Object.keys(spreadFires(s,spots).hazards)).toHaveLength(1);});

it("preserves lifetime age and waits another interval before spreading again",()=>{let s=spreadFires(setup(15),spots);expect(Object.keys(spreadFires(s,spots).hazards)).toHaveLength(2);s.hazards.f!.age=30;expect(Object.keys(spreadFires(s,spots).hazards)).toHaveLength(3);});

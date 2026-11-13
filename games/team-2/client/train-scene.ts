/** Roof-off top-down pixel-art environment for Last Train. This module draws only the world backdrop; mount HUD and controls in separate layers. */
const W = 480;
const H = 900;
const C = {
	earth: "#302d25", dark: "#24231f", grit: "#51493c", moss: "#506b34",
	green: "#668b20", lime: "#91ae34", greenDark: "#344817",
	steel: "#343b3b", steelHi: "#92978c", floor: "#655d50",
	wood: "#553523", woodHi: "#805134", red: "#9e3c43",
	redHi: "#d26a65", gold: "#ffc956", cream: "#e7d9b6",
};

type Box = { x: number; y: number; w: number; h: number };

/** Draw the static world into a responsive canvas with crisp nearest-neighbour scaling. */
export function drawTrainScene(context: CanvasRenderingContext2D): void {
	const scene = document.createElement("canvas");
	scene.width = W;
	scene.height = H;
	const g = scene.getContext("2d");
	if (!g) return;

	ground(g);
	tracks(g);
	scenery(g);
	train(g);

	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, context.canvas.width, context.canvas.height);
	const scale = Math.max(0.1, Math.min(context.canvas.width / W, context.canvas.height / H));
	const w = Math.floor(W * scale);
	const h = Math.floor(H * scale);
	context.drawImage(scene, Math.floor((context.canvas.width - w) / 2), Math.floor((context.canvas.height - h) / 2), w, h);
}

/** Mount the backdrop into a canvas. Returns a cleanup callback. */
export function mountTrainScene(canvas: HTMLCanvasElement): () => void {
	const context = canvas.getContext("2d");
	if (!context) return () => undefined;
	const resize = () => {
		const bounds = canvas.getBoundingClientRect();
		const ratio = Math.max(1, window.devicePixelRatio || 1);
		canvas.width = Math.max(1, Math.round(bounds.width * ratio));
		canvas.height = Math.max(1, Math.round(bounds.height * ratio));
		drawTrainScene(context);
	};
	const observer = new ResizeObserver(resize);
	observer.observe(canvas);
	resize();
	return () => observer.disconnect();
}

function ground(g: CanvasRenderingContext2D): void {
	g.fillStyle = C.earth;
	g.fillRect(0, 0, W, H);
	for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) {
		const n = hash(x, y);
		if (n % 11 < 4) continue;
		g.fillStyle = n % 7 === 0 ? C.grit : C.dark;
		g.fillRect(x + n % 4, y + (n >> 3) % 4, n % 3 === 0 ? 2 : 1, n % 3 === 0 ? 2 : 1);
	}
	for (let y = 13; y < H; y += 21) for (let x = 11; x < W; x += 29) {
		const n = hash(x, y);
		if (n % 4 === 0) {
			g.fillStyle = "#71634b";
			g.fillRect(x + n % 9, y, 3, 2);
		}
	}
}

function tracks(g: CanvasRenderingContext2D): void {
	for (const [left, right] of [[78, 126], [354, 402]] as const) {
		g.fillStyle = "#211f1b";
		g.fillRect(left - 11, 0, right - left + 22, H);
		for (let y = -8; y < H; y += 28) {
			g.fillStyle = "#38271f";
			g.fillRect(left - 7, y, right - left + 14, 13);
			g.fillStyle = C.wood;
			g.fillRect(left - 5, y + 1, right - left + 10, 9);
			g.fillStyle = C.woodHi;
			g.fillRect(left - 4, y + 2, right - left + 8, 2);
			g.fillStyle = "#36271e";
			g.fillRect(left - 6, y + 9, right - left + 12, 2);
		}
		for (const x of [left, right]) {
			g.fillStyle = "#555d5c";
			g.fillRect(x - 4, 0, 8, H);
			g.fillStyle = "#b2b3a8";
			g.fillRect(x - 2, 0, 3, H);
			g.fillStyle = "#737a76";
			g.fillRect(x + 1, 0, 2, H);
		}
		for (let y = 0; y < H; y += 17) for (let x = left - 9; x <= right + 9; x += 7) {
			const n = hash(x, y);
			if (n % 3 === 0) continue;
			g.fillStyle = n % 2 ? "#746a59" : "#3c3932";
			g.fillRect(x + n % 3, y + (n >> 2) % 5, 2, 2);
		}
	}
}

function scenery(g: CanvasRenderingContext2D): void {
	for (const [x, y, size] of [
		[29, 73, 22], [441, 96, 16], [31, 201, 16], [452, 252, 22],
		[30, 367, 22], [445, 439, 16], [25, 555, 16], [452, 615, 22],
		[37, 759, 22], [444, 814, 16], [142, 114, 16], [336, 699, 16],
	] as const) bush(g, x, y, size);
	rock(g, 55, 293, 15); rock(g, 426, 346, 10); rock(g, 60, 692, 18); rock(g, 421, 733, 24);
	g.fillStyle = "#252823"; g.fillRect(16, 464, 57, 34); g.fillRect(22, 459, 42, 44);
	g.fillStyle = "#31555a"; g.fillRect(20, 466, 49, 27);
	g.fillStyle = "#568186"; g.fillRect(28, 468, 16, 3); g.fillRect(51, 481, 8, 2);
	// A small trackside lamp.
	g.fillStyle = "#252322"; g.fillRect(425, 535, 13, 5);
	g.fillStyle = "#535b5b"; g.fillRect(429, 500, 4, 36);
	g.fillStyle = "#272c2d"; g.fillRect(423, 495, 16, 7);
	g.fillStyle = C.gold; g.fillRect(426, 497, 10, 3);
}

function bush(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
	g.fillStyle = "#211e1a"; g.fillRect(x - s / 2, y + s / 2 - 2, s, 5);
	g.fillStyle = "#34452a"; g.fillRect(x - s / 2, y - s / 3, s, s * .8); g.fillRect(x - s / 3, y - s / 2, s * .66, s);
	g.fillStyle = "#56733a"; g.fillRect(x - s / 3, y - s / 3, s * .58, s * .48); g.fillRect(x - s / 2 + 2, y + 1, s * .42, s * .32);
	g.fillStyle = "#7e9944"; g.fillRect(x - s / 4, y - s / 3, 4, 3);
}

function rock(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
	g.fillStyle = "#282722"; g.fillRect(x - s / 2, y - s / 3, s, s * .68); g.fillRect(x - s / 3, y - s / 2, s * .7, s);
	g.fillStyle = "#5e5a50"; g.fillRect(x - s / 3, y - s / 3, s * .6, s * .42);
	g.fillStyle = "#858071"; g.fillRect(x - s / 4, y - s / 3, s * .26, 3);
}

function train(g: CanvasRenderingContext2D): void {
	const x = 166, width = 148;
	g.fillStyle = "rgba(255,192,76,.08)"; g.fillRect(x - 12, 28, width + 24, 828);
	shell(g, { x, y: 20, w: width, h: 190 }, true);
	cabin(g, x, 20);
	gangway(g, x, 204);
	shell(g, { x, y: 213, w: width, h: 260 });
	engine(g, x, 213);
	gangway(g, x, 467);
	shell(g, { x, y: 476, w: width, h: 318 });
	passengerCar(g, x, 476);
	rearNose(g, x, 788);
}

function shell(g: CanvasRenderingContext2D, b: Box, rounded = false): void {
	const r = rounded ? 22 : 12;
	g.fillStyle = "#161b19"; rr(g, b.x - 5, b.y - 4, b.w + 10, b.h + 8, r);
	g.fillStyle = C.greenDark; rr(g, b.x, b.y, b.w, b.h, r);
	g.fillStyle = C.green; g.fillRect(b.x + 6, b.y + 7, b.w - 12, b.h - 14);
	g.fillStyle = C.lime; g.fillRect(b.x + 5, b.y + 12, 3, b.h - 24);
	g.fillStyle = "#263326"; g.fillRect(b.x + b.w - 8, b.y + 12, 3, b.h - 24);
	g.fillStyle = "#a3a091"; g.fillRect(b.x + 3, b.y + 17, 2, b.h - 34);
	g.fillStyle = "#232a27"; g.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
	g.fillStyle = C.floor; g.fillRect(b.x + 14, b.y + 14, b.w - 28, b.h - 28);
	for (let y = b.y + 19; y < b.y + b.h - 18; y += 22) {
		g.fillStyle = "#756d5f"; g.fillRect(b.x + 14, y, b.w - 28, 1);
	}
	for (let x = b.x + 31; x < b.x + b.w - 24; x += 28) {
		g.fillStyle = "#756d5f"; g.fillRect(x, b.y + 15, 1, b.h - 30);
	}
	for (const y of [b.y + 16, b.y + b.h - 18]) {
		g.fillStyle = "#b1b5a6"; g.fillRect(b.x + 6, y, 3, 3); g.fillRect(b.x + b.w - 9, y, 3, 3);
	}
}

function cabin(g: CanvasRenderingContext2D, x: number, y: number): void {
	// Driver's desk, screens, side consoles, chair, and a crew member.
	g.fillStyle = "#302e2a"; rr(g, x + 22, y + 21, 104, 48, 4);
	g.fillStyle = "#8a7960"; g.fillRect(x + 25, y + 24, 98, 3);
	monitor(g, x + 31, y + 30, 22, 17, "#49aec5");
	monitor(g, x + 60, y + 27, 32, 22, "#53bcd0");
	monitor(g, x + 99, y + 30, 21, 17, "#d59b45");
	for (const bx of [35, 43, 103]) { g.fillStyle = "#c4b796"; g.fillRect(x + bx, y + 53, 4, 4); }
	g.fillStyle = "#bd5147"; g.fillRect(x + 111, y + 53, 4, 4);
	g.fillStyle = "#42433d"; g.fillRect(x + 16, y + 79, 15, 46); g.fillRect(x + 117, y + 79, 15, 46);
	for (let i = 0; i < 4; i++) {
		g.fillStyle = i === 0 ? "#65b9c4" : "#d18b45";
		g.fillRect(x + 19, y + 84 + i * 9, 7, 3); g.fillRect(x + 122, y + 84 + i * 9, 7, 3);
	}
	g.fillStyle = "#292d2d"; g.fillRect(x + 65, y + 61, 19, 22);
	g.fillStyle = "#68706c"; g.fillRect(x + 68, y + 64, 13, 16);
	character(g, x + 74, y + 111, "#e0b548", "#398eb2");
	// Front windows and running lamps.
	g.fillStyle = "#161d20"; g.fillRect(x + 25, y + 157, 37, 18); g.fillRect(x + 86, y + 157, 37, 18);
	g.fillStyle = "#287078"; g.fillRect(x + 28, y + 160, 31, 12); g.fillRect(x + 89, y + 160, 31, 12);
	g.fillStyle = C.gold; g.fillRect(x + 8, y + 134, 4, 13); g.fillRect(x + 136, y + 134, 4, 13);
}

function engine(g: CanvasRenderingContext2D, x: number, y: number): void {
	// Thick return pipe, cables, and exposed repair machinery.
	g.fillStyle = "#483d32"; g.fillRect(x + 19, y + 25, 12, 98);
	g.fillStyle = "#a7513e"; g.fillRect(x + 22, y + 27, 6, 38); g.fillRect(x + 22, y + 62, 21, 7); g.fillRect(x + 37, y + 62, 7, 51);
	g.fillStyle = "#df8652"; g.fillRect(x + 23, y + 31, 2, 29); g.fillRect(x + 27, y + 66, 11, 2);
	// Generator casing and lightning-shaped power core.
	g.fillStyle = "#2c3130"; rr(g, x + 47, y + 61, 66, 88, 7);
	g.fillStyle = "#59615c"; g.fillRect(x + 52, y + 68, 56, 74);
	g.fillStyle = "#343b3a"; g.fillRect(x + 57, y + 75, 46, 60);
	g.fillStyle = "#272b2a"; g.fillRect(x + 62, y + 80, 36, 50);
	g.fillStyle = "#ffd24f"; g.fillRect(x + 78, y + 91, 8, 18); g.fillRect(x + 73, y + 97, 18, 7);
	g.fillStyle = "#f39737"; g.fillRect(x + 80, y + 84, 4, 7); g.fillRect(x + 80, y + 109, 4, 8);
	g.fillStyle = "#88918b"; for (let i = 0; i < 5; i++) g.fillRect(x + 55 + i * 11, y + 147, 5, 4);
	// Electrical cabinets, indicator lamps, and pressure gauge.
	g.fillStyle = "#3c423f"; g.fillRect(x + 116, y + 28, 17, 56);
	g.fillStyle = "#7e755d"; g.fillRect(x + 119, y + 33, 11, 3);
	for (let i = 0; i < 4; i++) {
		g.fillStyle = ["#53bb9b", "#dfbc4e", "#c84d4e", "#5eb1c1"][i]!;
		g.fillRect(x + 120 + (i % 2) * 6, y + 42 + Math.floor(i / 2) * 8, 3, 3);
	}
	g.fillStyle = "#292f2e"; g.fillRect(x + 112, y + 101, 21, 47);
	g.fillStyle = "#69726d"; g.fillRect(x + 116, y + 105, 13, 39);
	g.fillStyle = "#65b7ca"; g.fillRect(x + 119, y + 111, 7, 7);
	g.fillStyle = "#d5d2bd"; g.fillRect(x + 121, y + 113, 3, 3);
	// Lower pipe manifold and red handwheel.
	g.fillStyle = "#c28b45"; g.fillRect(x + 25, y + 169, 97, 8);
	g.fillStyle = "#e3b95d"; g.fillRect(x + 27, y + 170, 92, 2);
	g.fillStyle = "#343937"; g.fillRect(x + 48, y + 158, 6, 19); g.fillRect(x + 101, y + 158, 6, 19);
	valve(g, x + 73, y + 173);
	g.fillStyle = "#343936"; g.fillRect(x + 111, y + 182, 19, 37);
	g.fillStyle = "#9b8d70"; g.fillRect(x + 48, y + 225, 19, 8); g.fillRect(x + 81, y + 225, 26, 8);
	g.fillStyle = "#514b41"; g.fillRect(x + 52, y + 228, 3, 2); g.fillRect(x + 99, y + 228, 3, 2);
	character(g, x + 103, y + 202, "#263d53", "#9a5e2f");
}

function passengerCar(g: CanvasRenderingContext2D, x: number, y: number): void {
	// Red benches run down the walls, leaving the central aisle open.
	for (const row of [y + 31, y + 102, y + 184, y + 254] as const) {
		seat(g, x + 19, row); seat(g, x + 100, row);
	}
	for (const [tx, ty] of [[x + 56, y + 73], [x + 56, y + 155], [x + 56, y + 231]] as const) {
		g.fillStyle = "#463324"; g.fillRect(tx, ty, 38, 27);
		g.fillStyle = "#b28a57"; g.fillRect(tx + 2, ty + 2, 34, 21);
		g.fillStyle = "#e2d5b5"; g.fillRect(tx + 8, ty + 6, 12, 9); g.fillRect(tx + 22, ty + 10, 8, 7);
		g.fillStyle = C.gold; g.fillRect(tx + 29, ty + 4, 3, 4);
	}
	character(g, x + 43, y + 57, "#b34942", "#bf8050");
	character(g, x + 108, y + 57, "#31456c", "#87522f");
	character(g, x + 110, y + 217, "#e3bd45", "#d28c60");
	// Gangway doors and amber wall sconces.
	g.fillStyle = "#252a28"; g.fillRect(x + 58, y + 3, 32, 8); g.fillRect(x + 58, y + 307, 32, 8);
	g.fillStyle = "#a59a80"; g.fillRect(x + 61, y + 4, 26, 5); g.fillRect(x + 61, y + 308, 26, 5);
	for (const sy of [y + 18, y + 294]) {
		g.fillStyle = C.gold; g.fillRect(x + 10, sy, 4, 12); g.fillRect(x + 134, sy, 4, 12);
	}
}

function rearNose(g: CanvasRenderingContext2D, x: number, y: number): void {
	g.fillStyle = "#141917"; rr(g, x - 3, y - 5, 154, 104, 20);
	g.fillStyle = C.greenDark; rr(g, x, y, 148, 94, 18);
	g.fillStyle = C.green; g.fillRect(x + 10, y + 10, 128, 78);
	g.fillStyle = "#252c29"; g.fillRect(x + 20, y + 21, 48, 42); g.fillRect(x + 80, y + 21, 48, 42);
	g.fillStyle = "#17604c"; g.fillRect(x + 24, y + 25, 40, 34); g.fillRect(x + 84, y + 25, 40, 34);
	g.fillStyle = "#1c8a62"; g.fillRect(x + 27, y + 27, 12, 29); g.fillRect(x + 87, y + 27, 12, 29);
	g.fillStyle = "#a6b68e"; g.fillRect(x + 25, y + 24, 41, 2); g.fillRect(x + 85, y + 24, 41, 2);
	g.fillStyle = C.gold; g.fillRect(x + 16, y + 71, 13, 5); g.fillRect(x + 119, y + 71, 13, 5);
}

function gangway(g: CanvasRenderingContext2D, x: number, y: number): void {
	g.fillStyle = "#111614"; g.fillRect(x + 47, y, 54, 15);
	g.fillStyle = "#3e4542"; g.fillRect(x + 51, y + 1, 46, 12);
	g.fillStyle = "#828277"; g.fillRect(x + 56, y + 3, 36, 2);
	g.fillStyle = "#222826"; g.fillRect(x + 60, y + 6, 28, 4);
}

function seat(g: CanvasRenderingContext2D, x: number, y: number): void {
	g.fillStyle = "#46292b"; g.fillRect(x, y, 29, 44);
	g.fillStyle = C.red; g.fillRect(x + 2, y + 2, 25, 38);
	g.fillStyle = C.redHi; g.fillRect(x + 4, y + 4, 19, 3);
	g.fillStyle = "#6e3035"; g.fillRect(x + 5, y + 13, 17, 22);
	g.fillStyle = "#c15b5c"; g.fillRect(x + 7, y + 15, 13, 2);
	g.fillStyle = "#d3b47b"; g.fillRect(x + 3, y + 8, 3, 5);
}

function monitor(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
	g.fillStyle = "#13191a"; g.fillRect(x - 2, y - 2, w + 4, h + 4);
	g.fillStyle = color; g.fillRect(x, y, w, h);
	g.fillStyle = "#b9e1cf"; g.fillRect(x + 3, y + 3, Math.max(2, w - 8), 2);
	g.fillStyle = "#357f91"; g.fillRect(x + 4, y + h - 5, Math.max(2, w - 8), 2);
}

function valve(g: CanvasRenderingContext2D, x: number, y: number): void {
	g.fillStyle = "#292f2e"; g.fillRect(x - 2, y - 17, 4, 23);
	g.fillStyle = "#b43e42"; g.fillRect(x - 13, y - 17, 26, 4); g.fillRect(x - 2, y - 27, 4, 24);
	g.fillStyle = "#e06b55"; g.fillRect(x - 10, y - 17, 20, 2);
	g.fillStyle = "#e7b65a"; g.fillRect(x - 2, y - 2, 4, 6);
}

function character(g: CanvasRenderingContext2D, x: number, y: number, hair: string, shirt: string): void {
	g.fillStyle = "#251f1c"; g.fillRect(x - 7, y - 10, 14, 13);
	g.fillStyle = "#efc28b"; g.fillRect(x - 5, y - 8, 10, 9);
	g.fillStyle = hair; g.fillRect(x - 6, y - 10, 12, 4); g.fillRect(x - 7, y - 7, 3, 5);
	g.fillStyle = "#272522"; g.fillRect(x - 3, y - 4, 2, 2); g.fillRect(x + 2, y - 4, 2, 2);
	g.fillStyle = shirt; g.fillRect(x - 6, y + 2, 12, 11);
	g.fillStyle = "#282e35"; g.fillRect(x - 5, y + 12, 4, 7); g.fillRect(x + 1, y + 12, 4, 7);
	g.fillStyle = "#e4c274"; g.fillRect(x - 6, y + 5, 2, 4);
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
	g.beginPath(); g.roundRect(x, y, w, h, radius); g.fill();
}

function hash(x: number, y: number): number {
	let n = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0x7f4a7c15, 0xc2b2ae35);
	n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
	n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
	return (n ^ (n >>> 16)) >>> 0;
}


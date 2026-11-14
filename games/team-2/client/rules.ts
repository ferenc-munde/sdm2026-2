const GAME_RULES = [
	["Objective", "Work together to get the train to its destination before time runs out."],
	["Crew", "Rooms support 2–4 players. The host can depart with the crew currently aboard."],
	["Complete tasks", "Solve minigames at different stations to increase the train’s speed."],
	["Build speed", "Each completed task raises shared train speed, up to its maximum."],
	["Work together", "Everyone shares the same speed, distance progress, and countdown."],
	["Explore", "Move through all five connected carriages to find and complete tasks."],
	["Win", "Reach the destination before the countdown reaches zero."],
	["Lose", "If time runs out first, the whole crew loses."],
] as const;

function createRulesList(): HTMLOListElement {
	const list = document.createElement("ol");
	list.className = "game-rules__list";
	for (const [title, description] of GAME_RULES) {
		const item = document.createElement("li");
		const heading = document.createElement("strong");
		heading.textContent = title;
		const text = document.createElement("span");
		text.textContent = description;
		item.append(heading, text);
		list.append(item);
	}
	return list;
}

/** One rules source for both the first-entry screen and the persistent help panel. */
export function mountGameRules(parent: HTMLElement, onContinue: () => void): { destroy: () => void } {
	const root = document.createElement("div");
	root.className = "game-rules";
	root.innerHTML = `
		<section class="game-rules__welcome" aria-labelledby="game-rules-welcome-title">
			<div class="game-rules__welcome-card">
				<p class="game-rules__kicker">CREW BRIEFING · READ BEFORE BOARDING</p>
				<h1 id="game-rules-welcome-title">The Last Train</h1>
				<p class="game-rules__intro">Work together, keep the train moving, and get your crew to safety.</p>
				<div data-welcome-rules></div>
				<button class="game-rules__continue game-rules-control" type="button">Got It — Continue</button>
			</div>
		</section>
		<button class="game-rules__toggle game-rules-control" type="button"
			aria-label="How to Play" aria-expanded="false" aria-controls="game-rules-panel"
			title="How to Play">!</button>
		<section class="game-rules__panel" id="game-rules-panel" role="dialog"
			aria-labelledby="game-rules-title" aria-modal="false" hidden>
			<header class="game-rules__header">
				<div>
					<p class="game-rules__kicker">CREW BRIEFING</p>
					<h2 id="game-rules-title">How to Play</h2>
				</div>
				<button class="game-rules__close game-rules-control" type="button"
					aria-label="Close game rules" title="Close">×</button>
			</header>
			<div data-help-rules></div>
			<p class="game-rules__footnote">Keep moving, communicate, and look after your crew.</p>
		</section>
	`;
	parent.append(root);

	const welcome = root.querySelector<HTMLElement>(".game-rules__welcome")!;
	const continueButton = root.querySelector<HTMLButtonElement>(".game-rules__continue")!;
	const toggle = root.querySelector<HTMLButtonElement>(".game-rules__toggle")!;
	const panel = root.querySelector<HTMLElement>(".game-rules__panel")!;
	const close = root.querySelector<HTMLButtonElement>(".game-rules__close")!;
	root.querySelector("[data-welcome-rules]")!.append(createRulesList());
	root.querySelector("[data-help-rules]")!.append(createRulesList());

	let closeTimer: number | undefined;
	let restoringFocus = false;
	let lastPointerType = "";

	function setOpen(open: boolean): void {
		if (closeTimer !== undefined) {
			window.clearTimeout(closeTimer);
			closeTimer = undefined;
		}
		panel.hidden = !open;
		toggle.setAttribute("aria-expanded", String(open));
	}
	function closeAndRestoreFocus(): void {
		setOpen(false);
		restoringFocus = true;
		toggle.focus();
		restoringFocus = false;
	}
	function closeAfterPointerLeaves(): void {
		if (closeTimer !== undefined) window.clearTimeout(closeTimer);
		closeTimer = window.setTimeout(() => {
			closeTimer = undefined;
			const helpHasFocus = toggle === document.activeElement || panel.contains(document.activeElement);
			if (!helpHasFocus) setOpen(false);
		}, 140);
	}
	function onPointerEnter(event: PointerEvent): void {
		if (event.pointerType === "mouse") setOpen(true);
	}
	function onPointerLeave(event: PointerEvent): void {
		if (event.pointerType === "mouse") closeAfterPointerLeaves();
	}
	function onFocusIn(event: FocusEvent): void {
		if (restoringFocus || lastPointerType === "touch") return;
		if (event.target instanceof Element && event.target.closest(".game-rules__toggle, .game-rules__panel")) {
			setOpen(true);
		}
	}
	function onFocusOut(event: FocusEvent): void {
		if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
		closeAfterPointerLeaves();
	}
	function onKeyDown(event: KeyboardEvent): void {
		lastPointerType = "";
		if (event.key === "Escape" && !panel.hidden) {
			event.preventDefault();
			closeAndRestoreFocus();
		}
	}

	continueButton.addEventListener("click", () => {
		setOpen(false);
		welcome.hidden = true;
		onContinue();
		const playerNameInput = parent.querySelector<HTMLInputElement>("#lobby-player-name");
		restoringFocus = true;
		(playerNameInput ?? toggle).focus();
		restoringFocus = false;
	});
	toggle.addEventListener("pointerenter", onPointerEnter);
	toggle.addEventListener("pointerleave", onPointerLeave);
	panel.addEventListener("pointerenter", onPointerEnter);
	panel.addEventListener("pointerleave", onPointerLeave);
	root.addEventListener("focusin", onFocusIn);
	root.addEventListener("focusout", onFocusOut);
	root.addEventListener("pointerdown", (event) => {
		if (event instanceof PointerEvent) {
			lastPointerType = event.pointerType;
			if (event.pointerType === "mouse" && event.target instanceof Element &&
				event.target.closest(".game-rules__toggle, .game-rules__close")) event.preventDefault();
		}
	});
	toggle.addEventListener("click", (event) => {
		if (event.detail > 0 && window.matchMedia("(hover: none)").matches) setOpen(panel.hidden);
	});
	close.addEventListener("click", (event) => {
		if (event.detail === 0) closeAndRestoreFocus();
		else setOpen(false);
	});
	window.addEventListener("keydown", onKeyDown);

	return {
		destroy() {
			if (closeTimer !== undefined) window.clearTimeout(closeTimer);
			window.removeEventListener("keydown", onKeyDown);
			root.remove();
		},
	};
}

import { request as httpRequest, createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

export interface GatewayOptions {
  /** Names of the games that are served, one path each: `/<game>/`. */
  games: readonly string[];
  /** Names listed on the index as "not released yet"; their path answers 404. */
  planned?: readonly string[];
  /** The address of a game's private service, for example `http://team-1.railway.internal:8080`. */
  upstream(game: string): URL;
  /** Written as one JSON object per line. */
  log?: (fields: Record<string, unknown>) => void;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** `/team-1/some/path?x=1` → `{ game: "team-1", rest: "/some/path?x=1" }`; the part after the game keeps its query. */
export function splitGamePath(url: string): { game: string; rest: string } | undefined {
  const match = /^\/([^/?#]+)(\/[^#]*|\?[^#]*)?$/.exec(url);
  if (!match) return undefined;
  const rest = match[2] ?? "";
  let game: string;
  try {
    game = decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
  return { game, rest: rest.startsWith("?") ? `/${rest}` : rest };
}

/** The headers a proxied request carries: the client's own, with the host of the target. */
function forwardHeaders(headers: IncomingHttpHeaders, target: URL): IncomingHttpHeaders {
  return { ...headers, host: target.host };
}

export function createGateway(options: GatewayOptions): Server {
  const games = new Set(options.games);
  const planned = new Set((options.planned ?? []).filter((name) => !games.has(name)));
  const log = options.log ?? (() => undefined);

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const index = () => {
    const routes = [
      ...[...games].map((name) => ({ name, live: true })),
      ...[...planned].map((name) => ({ name, live: false })),
    ];
    const cards = routes.map(({ name, live }, index) => {
      const number = String(index + 1).padStart(2, "0");
      const team = /^team-(\d+)$/i.exec(name);
      const label = team ? `Team ${team[1]}` : name.toUpperCase().replace(/-/g, " ");
      const card = `
        <div class="route-card__top">
          <span>${team ? `TEAM ${team[1]!.padStart(2, "0")}` : `ROUTE ${number}`}</span>
          <span class="route-card__status">${live ? "LIVE BUILD" : "COMING SOON"}</span>
        </div>
        <div class="route-art route-art--${index % 3}" aria-hidden="true">
          <span class="route-art__eyebrow">SDM / DEPARTURE ${number}</span>
          <span class="route-art__number">${number}</span>
          <span class="route-art__word">ALL<br>ABOARD</span>
          <span class="route-art__track"><i></i></span>
        </div>
        <div class="route-card__bottom">
          <span><strong>${escapeHtml(label)}</strong><small>THE LAST TRAIN</small></span>
          <span class="route-card__action">${live ? "BOARD" : "SOON"} <b aria-hidden="true">→</b></span>
        </div>`;
      return live
        ? `<a class="route-card" href="/${encodeURIComponent(name)}/" aria-label="Open ${escapeHtml(label)} game">${card}</a>`
        : `<article class="route-card route-card--planned" aria-label="${escapeHtml(label)}, coming soon">${card}</article>`;
    }).join("");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#111916">
    <meta name="description" content="Choose a live game from the SDM network and step aboard.">
    <title>SDM Game Network - Choose Your Departure</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", sans-serif;
        background: #111916;
        color: #eee9dc;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        --paper: #eee9dc;
        --muted: #9c9b8e;
        --amber: #e7ad62;
        --line: rgba(238, 233, 220, .16);
      }
      * { box-sizing: border-box; }
      body {
        min-width: 320px;
        min-height: 100vh;
        margin: 0;
        background:
          radial-gradient(ellipse at 50% 0, rgba(71, 95, 76, .24), transparent 42rem),
          #111916;
      }
      a { color: inherit; }
      .site-shell { width: min(1120px, calc(100% - 64px)); margin: 0 auto; }
      .topbar {
        height: 92px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--line);
      }
      .brand { display: flex; align-items: center; gap: 13px; text-decoration: none; }
      .brand__mark {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 1px solid var(--amber);
        color: var(--amber);
        font: 700 12px Georgia, serif;
        letter-spacing: .06em;
      }
      .brand__name, .brand__sub, .network-state, .eyebrow, .section-heading p,
      .route-card__top, .route-art__eyebrow, .route-card__bottom small, .route-card__action,
      .footer { font-size: 10px; letter-spacing: .14em; }
      .brand__name { display: block; font-weight: 700; }
      .brand__sub { display: block; margin-top: 5px; color: var(--muted); font-size: 8px; }
      .network-state { display: flex; align-items: center; gap: 9px; color: #c4c6b8; }
      .network-state__dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #9aba78;
        box-shadow: 0 0 12px rgba(154, 186, 120, .6);
      }
      main { padding: 78px 0 86px; }
      .hero {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 32px;
        padding: 0 0 70px;
      }
      .eyebrow { display: flex; align-items: center; gap: 10px; color: var(--amber); }
      .eyebrow__line { width: 28px; height: 1px; background: var(--amber); }
      h1 {
        margin: 25px 0 18px;
        font: 400 clamp(54px, 8vw, 94px)/.93 Georgia, "Times New Roman", serif;
        letter-spacing: -.065em;
      }
      h1 span { color: var(--amber); font-style: italic; }
      .hero__intro { max-width: 430px; margin: 0; color: #b7b7aa; font-size: 15px; line-height: 1.7; }
      .hero__stamp {
        position: relative;
        display: grid;
        min-width: 172px;
        padding: 18px 22px;
        border: 1px solid var(--line);
        color: var(--muted);
      }
      .hero__stamp::before, .hero__stamp::after {
        position: absolute;
        top: 50%;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #111916;
        content: "";
      }
      .hero__stamp::before { left: -6px; border-right: 1px solid var(--line); }
      .hero__stamp::after { right: -6px; border-left: 1px solid var(--line); }
      .hero__stamp-label, .hero__stamp-caption { font-size: 9px; letter-spacing: .16em; }
      .hero__stamp-number { margin: 8px 0 3px; color: var(--paper); font: 48px/.95 Georgia, serif; }
      .routes { border-top: 1px solid var(--line); padding-top: 24px; }
      .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
      .section-heading h2 { margin: 0; font: 400 25px Georgia, serif; }
      .section-heading p { margin: 0; color: var(--muted); }
      .route-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .route-card {
        display: block;
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--line);
        background: rgba(23, 33, 28, .72);
        text-decoration: none;
        transition: border-color .2s ease, transform .2s ease, background .2s ease;
      }
      a.route-card:hover { transform: translateY(-4px); border-color: rgba(231, 173, 98, .72); background: #1b2821; }
      a.route-card:focus-visible { outline: 2px solid var(--amber); outline-offset: 4px; }
      .route-card--planned { opacity: .58; }
      .route-card__top, .route-card__bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .route-card__top { min-height: 23px; color: var(--muted); font-size: 9px; }
      .route-card__status { color: #a9bf8d; font-size: 8px; }
      .route-art {
        position: relative;
        display: flex;
        height: 188px;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        margin: 12px 0 16px;
        padding: 15px;
        background: radial-gradient(ellipse at 78% 24%, rgba(231, 173, 98, .2), transparent 42%), #26352c;
      }
      .route-art--1 { background: radial-gradient(ellipse at 25% 35%, rgba(155, 176, 128, .23), transparent 45%), #263431; }
      .route-art--2 { background: radial-gradient(ellipse at 73% 70%, rgba(195, 117, 77, .23), transparent 45%), #342f28; }
      .route-art::before {
        position: absolute;
        top: 28px;
        right: 24px;
        width: 132px;
        height: 132px;
        border: 1px solid rgba(238, 233, 220, .17);
        border-radius: 50%;
        box-shadow: 0 0 0 16px rgba(238, 233, 220, .035), 0 0 0 34px rgba(238, 233, 220, .025);
        content: "";
      }
      .route-art__eyebrow { position: relative; z-index: 1; color: rgba(238, 233, 220, .72); font-size: 8px; }
      .route-art__number {
        position: absolute;
        top: 14px;
        right: 14px;
        color: rgba(238, 233, 220, .13);
        font: 96px/.9 Georgia, serif;
      }
      .route-art__word { position: relative; z-index: 1; font: 32px/.82 Georgia, serif; letter-spacing: -.04em; }
      .route-art__track { position: relative; z-index: 1; height: 1px; background: rgba(238, 233, 220, .36); }
      .route-art__track i { position: absolute; top: -3px; left: 27%; width: 7px; height: 7px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 12px var(--amber); }
      .route-card__bottom { min-height: 43px; }
      .route-card__bottom strong { display: block; font: 20px Georgia, serif; font-weight: 400; }
      .route-card__bottom small { display: block; margin-top: 5px; color: var(--muted); font-size: 8px; }
      .route-card__action { color: var(--amber); white-space: nowrap; font-size: 9px; }
      .route-card__action b { margin-left: 5px; font-size: 15px; font-weight: 400; }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 20px 0 28px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 8px;
      }
      @media (max-width: 760px) {
        .site-shell { width: min(100% - 36px, 560px); }
        .topbar { height: 76px; }
        main { padding: 56px 0 62px; }
        .hero { align-items: start; padding-bottom: 48px; }
        .hero__stamp { min-width: 118px; padding: 14px; }
        .hero__stamp-number { font-size: 38px; }
        .route-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 520px) {
        .site-shell { width: calc(100% - 32px); }
        .network-state { font-size: 8px; }
        .hero { display: block; }
        .hero__stamp { display: none; }
        h1 { font-size: clamp(56px, 15vw, 76px); }
        .hero__intro { font-size: 14px; }
        .section-heading { align-items: start; flex-direction: column; gap: 8px; }
        .route-grid { grid-template-columns: 1fr; gap: 12px; }
        .route-art { height: 164px; }
        .footer { flex-direction: column; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
    </style>
  </head>
  <body>
    <div class="site-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="SDM game network home">
          <span class="brand__mark">SDM</span>
          <span><span class="brand__name">GAME NETWORK</span><span class="brand__sub">DEPARTURE BOARD</span></span>
        </a>
        <div class="network-state"><span class="network-state__dot"></span> NETWORK LIVE</div>
      </header>
      <main>
        <section class="hero" aria-labelledby="page-title">
          <div>
            <p class="eyebrow"><span class="eyebrow__line"></span> LIVE FROM THE PLATFORM</p>
            <h1 id="page-title">Choose your<br><span>departure.</span></h1>
            <p class="hero__intro">One shared platform. Pick a team, enter its live build and step aboard.</p>
          </div>
          <aside class="hero__stamp" aria-label="${games.size} live route${games.size === 1 ? "" : "s"}">
            <span class="hero__stamp-label">NOW BOARDING</span>
            <strong class="hero__stamp-number">${String(games.size).padStart(2, "0")}</strong>
            <span class="hero__stamp-caption">LIVE ROUTES</span>
          </aside>
        </section>
        <section class="routes" id="routes" aria-labelledby="routes-title">
          <div class="section-heading">
            <h2 id="routes-title">The departure board</h2>
            <p>SELECT A ROUTE TO PLAY</p>
          </div>
          <div class="route-grid">${cards}</div>
        </section>
      </main>
      <footer class="footer"><span>SDM / MULTIPLAYER GAME NETWORK</span><span>ONE ADDRESS. EVERY CREW.</span></footer>
    </div>
  </body>
</html>`;
  };

  const target = (game: string, rest: string): URL => {
    const base = options.upstream(game);
    return new URL(rest || "/", base);
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    if (url === "/health" || url === "/health/") return sendJson(res, 200, { ok: true });
    if (url === "/" || url.startsWith("/?")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return void res.end(index());
    }
    const path = splitGamePath(url);
    if (!path || (!games.has(path.game) && !planned.has(path.game))) return sendJson(res, 404, { error: "not found" });
    if (planned.has(path.game)) return sendJson(res, 404, { error: "this game is not released yet" });
    if (path.rest === "") {
      res.writeHead(308, { location: `/${encodeURIComponent(path.game)}/` });
      return void res.end();
    }

    const upstream = target(path.game, path.rest);
    const proxied = httpRequest(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: upstream.pathname + upstream.search,
        headers: forwardHeaders(req.headers, upstream),
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    proxied.on("error", (error) => {
      log({ level: "warn", message: "game unreachable", game: path.game, error: String(error) });
      if (res.headersSent) return void res.destroy();
      sendJson(res, 502, { error: `${path.game} cannot be reached` });
    });
    res.on("close", () => proxied.destroy());
    req.pipe(proxied);
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = splitGamePath(req.url ?? "/");
    const refuse = (status: string) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    };
    if (!path || !games.has(path.game) || path.rest === "") return refuse("404 Not Found");

    const upstream = target(path.game, path.rest);
    const proxied = httpRequest({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: upstream.pathname + upstream.search,
      headers: forwardHeaders(req.headers, upstream),
    });
    proxied.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}`];
      for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) lines.push(`${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}`);
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length > 0) socket.write(upstreamHead);
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
      upstreamSocket.on("error", () => socket.destroy());
      socket.on("error", () => upstreamSocket.destroy());
      socket.on("close", () => upstreamSocket.destroy());
      upstreamSocket.on("close", () => socket.destroy());
    });
    // The game answered the upgrade request with a plain response (for example a refusal): pass it on.
    proxied.on("response", (upstreamRes) => {
      socket.end(`HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}\r\nConnection: close\r\n\r\n`);
      upstreamRes.resume();
    });
    proxied.on("error", (error) => {
      log({ level: "warn", message: "game unreachable", game: path.game, error: String(error) });
      refuse("502 Bad Gateway");
    });
    proxied.end();
  });

  return server;
}

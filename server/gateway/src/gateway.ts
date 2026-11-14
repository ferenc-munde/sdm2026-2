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
    const item = (name: string, released: boolean) =>
      released
        ? `<li><a href="/${encodeURIComponent(name)}/">${escapeHtml(name)}</a></li>`
        : `<li>${escapeHtml(name)} <em>(not released yet)</em></li>`;
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Games</title><h1>Games</h1><ul>${[
      ...[...games].map((name) => item(name, true)),
      ...[...planned].map((name) => item(name, false)),
    ].join("")}</ul></html>`;
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

/**
 * OpenBika Bun function launcher (mounted at `/srv/.openbika/function-launcher.bun.ts`).
 * Spawns user code then either passes through inbound `PORT`, or fronts it with an HTTP proxy
 * when apps ignore env and bind a common dev port (e.g. 3000).
 */

import * as net from "node:net";

const entryRelative =
  process.env.OPENBIKA_ENTRYPOINT?.replace(/^(\.\.[\\/])+/, "") ?? "index.ts";
const inbound = Number(process.env.PORT ?? 9100);
const cwd = "/srv";

const probeCsv =
  process.env.OPENBIKA_UPSTREAM_PROBE_PORTS ??
  `${String(inbound)},3000,8080,5000,5173,8000,4000`;

const probePortsRaw = probeCsv
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n >= 1 && n <= 65535);
const probePorts = Array.from(new Set(probePortsRaw));

function listens(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function sleep(ms: number) {
  await new Promise<void>((r) => setTimeout(r, ms));
}

const childProc = Bun.spawn(["bun", "run", entryRelative], {
  cwd,
  env: { ...process.env, PORT: String(inbound) },
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
});

const exited = childProc.exited.then((code) =>
  typeof code === "number" ? code : 1,
);

let upstreamPort: number | null = null;
for (let i = 0; i < 200; i++) {
  await sleep(50);
  for (const candidate of probePorts) {
    if (await listens(candidate)) {
      upstreamPort = candidate;
      break;
    }
  }
  if (upstreamPort !== null) {
    break;
  }
}

if (upstreamPort === null) {
  console.error(
    "[openbika] No inbound HTTP listen port detected from:",
    probePorts.join(", "),
  );
  process.exit(await exited);
}

const upstreamOrigin = `http://127.0.0.1:${upstreamPort}`;

if (upstreamPort === inbound) {
  console.error(
    "[openbika] Function listening on OpenBika inbound port:",
    inbound,
  );
  process.exit(await exited);
}

console.error(
  "[openbika] HTTP proxy inbound",
  inbound,
  "-> user",
  upstreamPort,
);

const proxy = Bun.serve({
  hostname: "0.0.0.0",
  port: inbound,
  async fetch(req) {
    try {
      const url = new URL(req.url);
      const targetUrl = upstreamOrigin + url.pathname + url.search;
      const headers = new Headers(req.headers);
      headers.delete("host");

      /** `duplex` is only valid when forwarding a streamed body */
      const init: RequestInit & { duplex?: "half" } = {
        method: req.method,
        headers,
        body: req.body ?? undefined,
        redirect: "manual",
      };
      if (req.body) {
        init.duplex = "half";
      }

      return await fetch(targetUrl, init);
    } catch (err) {
      return new Response(err instanceof Error ? err.message : String(err), {
        status: 502,
      });
    }
  },
});

const exitCode = await exited;
proxy.stop();
process.exit(exitCode);

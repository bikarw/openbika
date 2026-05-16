/**
 * OpenBika Node function launcher (mounted at `/srv/.openbika/function-launcher.node.mjs`).
 * Spawns Node with the user entrypoint, then aligns Docker's published port (`PORT`).
 */

import * as http from "node:http";
import * as net from "node:net";
import { spawn } from "node:child_process";

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

function listens(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeListen() {
  for (let i = 0; i < 200; i++) {
    await sleep(50);
    for (const candidate of probePorts) {
      if (await listens(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

const stripped = /\.(ts|mts|tsx)$/i.test(entryRelative)
  ? ["--experimental-strip-types"]
  : [];

const nodeArgs = stripped.length
  ? [...stripped, entryRelative]
  : [entryRelative];

const child = spawn(process.execPath, nodeArgs, {
  cwd,
  env: { ...process.env, PORT: String(inbound) },
  stdio: "inherit",
});

const exited = new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
});

const upstreamPort = await probeListen();

if (upstreamPort === null) {
  console.error("[openbika] No inbound HTTP listen port detected from:", probePorts.join(", "));
  process.exit(/** @type {number} */ (await exited));
}

const upstreamHost = `http://127.0.0.1:${upstreamPort}`;

if (upstreamPort === inbound) {
  console.error("[openbika] Function listening on OpenBika inbound port:", inbound);
  process.exit(/** @type {number} */ (await exited));
}

console.error("[openbika] HTTP proxy inbound", inbound, "-> user", upstreamPort);

const server = http.createServer((clientReq, clientRes) => {
  const upstreamUrl = new URL(clientReq.url ?? "/", upstreamHost);
  const headers = /** @type {Record<string,string|string[] | undefined>} */ ({
    ...clientReq.headers,
  });
  delete headers.host;

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: clientReq.method ?? "GET",
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );

  proxyReq.on("error", (err) => {
    clientRes.statusCode = 502;
    clientRes.end(err instanceof Error ? err.message : String(err));
  });

  clientReq.pipe(proxyReq);
});

await new Promise((resolve) => server.listen(inbound, "0.0.0.0", resolve));

/** @type {number} */
const code = /** @type {number} */ (await exited);

server.close(() => process.exit(code));

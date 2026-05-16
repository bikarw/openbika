/**
 * Minimal Node HTTP handler (no deps). Launcher probes inbound PORT and proxies here.
 */
import http from "node:http";

const port = Number(process.env.PORT ?? 9100);
const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, kind: "node-http-fn-fixture" }));
});
server.listen(port, "127.0.0.1");

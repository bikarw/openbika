/** Intentionally ignores PORT — launcher must bridge this to OpenBika's Docker publish port */

Bun.serve({
  hostname: "0.0.0.0",
  port: 3000,
  fetch() {
    return new Response('{"ok":true}', {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  },
});

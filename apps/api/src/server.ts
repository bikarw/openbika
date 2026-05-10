import { serve } from "@hono/node-server";
import { apiEnvSchema, parseEnv } from "@openbika/env";

import { createApi } from "./app.js";

const env = parseEnv(apiEnvSchema);
const app = createApi({ env });

serve(
  {
    fetch: app.fetch,
    hostname: env.API_HOST,
    port: env.API_PORT,
  },
  (info) => {
    console.log(`Openbika API listening on http://${info.address}:${info.port}`);
  },
);

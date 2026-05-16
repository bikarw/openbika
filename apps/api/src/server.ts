import { serve } from "@hono/node-server";
import {
  apiEnvSchema,
  bootstrapIngressIpv4Env,
  parseEnv,
} from "@openbika/env";

import { createApi } from "./app.js";

await bootstrapIngressIpv4Env();
const env = parseEnv(apiEnvSchema);
const app = createApi({ env });

serve(
  {
    fetch: app.fetch,
    hostname: env.API_HOST,
    port: env.API_PORT,
  },
  (info) => {
    console.log(
      `Openbika API listening on http://${info.address}:${String(info.port)} (${env.API_PUBLIC_URL})`,
    );
  },
);

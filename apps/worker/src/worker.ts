import { NativeConnection, Worker } from "@temporalio/worker";
import { bootstrapIngressIpv4Env, parseEnv, workerEnvSchema } from "@openbika/env";
import { createLogger } from "@openbika/observability";

import * as activities from "./activities.js";

await bootstrapIngressIpv4Env();
const env = parseEnv(workerEnvSchema);
const logger = createLogger({
  level: env.LOG_LEVEL,
  name: "openbika-worker",
  pretty: env.ENABLE_PRETTY_LOGS,
});

const connection = await NativeConnection.connect({
  address: env.TEMPORAL_ADDRESS,
});
const workflowsPath = new URL(
  import.meta.url.endsWith(".ts") ? "./workflows.ts" : "./workflows.js",
  import.meta.url,
).pathname;

const worker = await Worker.create({
  activities,
  connection,
  namespace: env.TEMPORAL_NAMESPACE,
  taskQueue: env.TEMPORAL_TASK_QUEUE,
  workflowsPath,
});

logger.info(
  {
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
  },
  "Starting Temporal worker",
);

await worker.run();

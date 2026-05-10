import { Client, Connection } from "@temporalio/client";
import type { ApiEnv } from "@openbika/env";
import { type WorkflowName } from "@openbika/queue";
import type { WorkflowPayloads } from "@openbika/queue";

export class WorkflowDispatchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkflowDispatchError";
  }
}

export async function startControlPlaneWorkflow<TName extends WorkflowName>({
  env,
  name,
  payload,
  workflowId,
}: {
  env: ApiEnv;
  name: TName;
  payload: WorkflowPayloads[TName];
  workflowId: string;
}): Promise<void> {
  try {
    const connection = await Connection.connect({
      address: env.TEMPORAL_ADDRESS,
    });
    const client = new Client({
      connection,
      namespace: env.TEMPORAL_NAMESPACE,
    });

    await client.workflow.start(name, {
      args: [payload],
      taskQueue: env.TEMPORAL_TASK_QUEUE,
      workflowId,
    });

    await connection.close();
  } catch (error) {
    throw new WorkflowDispatchError(
      `Could not start ${name} workflow`,
      {
        cause: error,
      },
    );
  }
}

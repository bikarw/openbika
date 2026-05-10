import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type ControlPlaneDb = ReturnType<typeof createDb>;

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
  });
}

export function createDb(connectionString: string) {
  const pool = createPool(connectionString);

  return drizzle(pool, {
    schema,
  });
}

export { schema };

import type { PortalAuth } from "@openbika/auth";
import type { ControlPlaneDb } from "@openbika/db";
import type { Logger } from "@openbika/observability";

export interface ApiBindings {
  Variables: {
    auth: PortalAuth;
    db: ControlPlaneDb;
    logger: Logger;
    requestId: string;
    session: PortalAuth["$Infer"]["Session"]["session"] | null;
    user: PortalAuth["$Infer"]["Session"]["user"] | null;
  };
}

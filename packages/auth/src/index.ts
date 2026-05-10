import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import type { ControlPlaneDb } from "@openbika/db";
import { schema } from "@openbika/db";
import { createId, generateULID } from "@openbika/domain";

export type PortalRole = "owner" | "admin" | "member" | "viewer";

export interface CreateAuthOptions {
  trustedOrigin: string;
  db: ControlPlaneDb;
  secret: string;
  baseUrl: string;
}

export function createAuth({
  db,
  secret,
  baseUrl,
  trustedOrigin,
}: CreateAuthOptions) {
  return betterAuth({
    baseURL: baseUrl,
    secret,
    trustedOrigins: [trustedOrigin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const displayName = user.name?.trim() || user.email;
            const orgName = `${displayName}'s Org`;
            const organization = {
              id: createId("organization"),
              name: orgName,
              slug: buildOrgSlug(displayName),
            };

            await db.transaction(async (tx) => {
              await tx.insert(schema.organizations).values(organization);
              await tx.insert(schema.memberships).values({
                id: createId("membership"),
                organizationId: organization.id,
                role: "owner",
                userId: user.id,
              });
            });
          },
        },
      },
    },
  });
}

export type PortalAuth = ReturnType<typeof createAuth>;

export function canManageOrganization(role: PortalRole): boolean {
  switch (role) {
    case "owner":
    case "admin":
      return true;
    case "member":
    case "viewer":
      return false;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

function buildOrgSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = generateULID().toLowerCase().slice(-8);
  const room = 63 - suffix.length - 1;
  const rootRaw = (base.length >= 2 ? base : "org").slice(0, room);
  const root = rootRaw.replace(/-+$/g, "") || "org";
  return `${root}-${suffix}`;
}

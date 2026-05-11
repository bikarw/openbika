import { getDashboardApiClient } from "#/lib/openbika-client";

export async function resolveDatabaseIdForBranch(
  organizationSlug: string,
  projectSlug: string,
  branchId: string,
): Promise<string | null> {
  try {
    const client = getDashboardApiClient();

    const orgs = await client.listOrganizations();
    const organization = orgs.find((org) => org.slug === organizationSlug);
    if (!organization) return null;

    const projects = await client.listProjects({
      organizationId: organization.id,
    });
    const project = projects.find((item) => item.slug === projectSlug);
    if (!project) return null;

    const databases = await client.listDatabases(project.id);
    const hit = databases.find((database) =>
      database.branches.some((branch) => branch.id === branchId),
    );

    return hit?.id ?? null;
  } catch {
    return null;
  }
}

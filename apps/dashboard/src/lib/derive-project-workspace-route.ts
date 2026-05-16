export type ProjectWorkspaceView =
  | "branches"
  | "dashboard"
  | "database-detail"
  | "databases"
  | "services"
  | "workloads"
  | "workload-detail";

export function deriveProjectWorkspaceRoute(
  pathname: string,
  organizationSlug: string,
  projectSlug: string,
): {
  databaseDetailId?: string;
  view: ProjectWorkspaceView;
  workloadDetailId?: string;
} {
  const norm =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const base = `/${organizationSlug}/projects/${projectSlug}`;
  if (!norm.startsWith(base)) {
    return { view: "dashboard" };
  }

  const rest =
    norm.length === base.length ? "" : norm.slice(base.length).replace(/^\//u, "");
  const segments = rest.length > 0 ? rest.split("/").filter(Boolean) : [];

  if (segments.length === 0) {
    return { view: "dashboard" };
  }

  if (segments[0] === "workloads") {
    if (segments.length >= 2) {
      return {
        view: "workload-detail",
        workloadDetailId: segments[1],
      };
    }
    return { view: "workloads" };
  }

  if (segments[0] === "databases") {
    if (segments.length >= 2) {
      return {
        view: "database-detail",
        databaseDetailId: segments[1],
      };
    }
    return { view: "databases" };
  }

  if (segments[0] === "branches") {
    return { view: "branches" };
  }

  if (segments[0] === "services") {
    return { view: "services" };
  }

  return { view: "dashboard" };
}

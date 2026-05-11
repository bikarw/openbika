import { createFileRoute } from "@tanstack/react-router";

import {
  BranchWorkspaceView,
  useProjectWorkspaceOutlet,
} from "#/components/project-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view",
)({
  parseParams: (raw: Record<string, string>) => {
    const lowered = typeof raw.view === "string" ? raw.view.toLowerCase() : "overview";
    const view =
      lowered === "sql" || lowered === "tables" || lowered === "overview"
        ? lowered
        : "overview";

    return {
      branchId: raw.branchId ?? "",
      databaseId: raw.databaseId ?? "",
      organizationSlug: raw.organizationSlug ?? "",
      projectSlug: raw.projectSlug ?? "",
      view,
    };
  },
  component: DatabaseBranchStudioRoutePage,
});

function DatabaseBranchStudioRoutePage() {
  const { branchId, databaseId, view } = Route.useParams();

  const { branches } = useProjectWorkspaceOutlet();
  const selectedBranch =
    branches.find(
      (row) => row.branch.id === branchId && row.database.id === databaseId,
    ) ?? null;

  if (!selectedBranch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Branch not found</CardTitle>
          <CardDescription>
            This branch is not part of this database in the current project.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Return to the database{" "}
          <span className="text-foreground font-medium">Overview</span>, or use
          the branch menu in the header, to pick another branch.
        </CardContent>
      </Card>
    );
  }

  return (
    <BranchWorkspaceView
      branches={branches}
      selectedBranch={selectedBranch}
      view={view}
    />
  );
}

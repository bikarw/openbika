import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId",
)({
  component: () => <Outlet />,
});

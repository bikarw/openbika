import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/",
)({
  component: () => null,
});

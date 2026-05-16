import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/env",
)({
  component: DatabaseEnvRedirectRoute,
});

function DatabaseEnvRedirectRoute() {
  const { databaseId, organizationSlug, projectSlug } = Route.useParams();

  return (
    <Navigate
      params={{ databaseId, organizationSlug, projectSlug }}
      replace
      to="/$organizationSlug/projects/$projectSlug/databases/$databaseId"
    />
  );
}

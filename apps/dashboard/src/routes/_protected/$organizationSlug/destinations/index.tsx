import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import type { S3DestinationResponse } from "@openbika/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";

import { authClient } from "#/auth-client";
import { DashboardShell } from "#/components/dashboard-shell";
import { OrgSwitcher } from "#/components/org-switcher";
import { S3DestinationFormDialog } from "#/components/s3-destination-form-dialog";
import {
  dashboardKeys,
  fetchHealthOk,
  fetchOrganizations,
  fetchS3Destinations,
} from "#/lib/dashboard-api-queries";
import { getDashboardApiClient } from "#/lib/openbika-client";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";
import { s3ProviderLabel } from "#/lib/s3-providers";
import { Route as RootRoute } from "#/routes/__root";
import { Badge } from "@openbika/ui/components/badge";
import { Button } from "@openbika/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openbika/ui/components/table";

export const Route = createFileRoute("/_protected/$organizationSlug/destinations/")(
  {
    component: DestinationsPage,
  },
);

function pickOrganization(
  organizations: { id: string; slug: string }[],
): { id: string; slug: string } | null {
  if (organizations.length === 0) return null;
  const stored = readStoredOrganizationId();
  const storedOrganization = organizations.find((o) => o.id === stored);
  if (storedOrganization) {
    return storedOrganization;
  }
  return organizations[0] ?? null;
}

function DestinationsPage() {
  const { organizationSlug } = Route.useParams();
  const { auth } = RootRoute.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  });

  const organizations = orgsQuery.data ?? [];
  const activeOrg = organizations.find((o) => o.slug === organizationSlug);
  const orgId = activeOrg?.id ?? null;
  const canManage =
    activeOrg?.role === "owner" || activeOrg?.role === "admin";

  React.useEffect(() => {
    if (!orgsQuery.data || orgsQuery.isPending) return;
    const active = orgsQuery.data.find((o) => o.slug === organizationSlug);
    if (active) {
      writeStoredOrganizationId(active.id);
      return;
    }
    const fallback = pickOrganization(orgsQuery.data);
    if (!fallback) return;
    void navigate({
      params: { organizationSlug: fallback.slug },
      replace: true,
      to: "/$organizationSlug/destinations",
    });
  }, [orgsQuery.data, orgsQuery.isPending, organizationSlug, navigate]);

  const healthQuery = useQuery({
    queryKey: dashboardKeys.health(),
    queryFn: fetchHealthOk,
  });

  const destinationsQuery = useQuery({
    enabled: orgId !== null,
    queryFn: () => fetchS3Destinations(orgId as string),
    queryKey: dashboardKeys.s3Destinations(orgId ?? ""),
  });

  const pending =
    orgsQuery.isPending || (orgId !== null && destinationsQuery.isPending);

  const [formDialogOpen, setFormDialogOpen] = React.useState(false);
  const [formDialogMode, setFormDialogMode] = React.useState<
    "create" | "edit"
  >("create");
  const [formDialogDestination, setFormDialogDestination] =
    React.useState<S3DestinationResponse | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (destinationId: string) => {
      await getDashboardApiClient().deleteS3Destination(destinationId);
    },
    onSuccess: async () => {
      if (orgId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.s3Destinations(orgId),
        });
      }
    },
  });

  const healthStatus: "error" | "loading" | "ok" | null = React.useMemo(() => {
    if (orgsQuery.isPending && !orgsQuery.data) return "loading";
    if (healthQuery.isPending) return "loading";
    return healthQuery.data ? "ok" : "error";
  }, [
    orgsQuery.isPending,
    orgsQuery.data,
    healthQuery.isPending,
    healthQuery.data,
  ]);

  function handleSelectOrganization(organizationId: string) {
    const organization = organizations.find((org) => org.id === organizationId);
    if (!organization) return;

    writeStoredOrganizationId(organization.id);
    void navigate({
      params: { organizationSlug: organization.slug },
      to: "/$organizationSlug/destinations",
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  function openCreateDialog() {
    setFormDialogMode("create");
    setFormDialogDestination(null);
    setFormDialogOpen(true);
  }

  function openEditDialog(destination: S3DestinationResponse) {
    setFormDialogMode("edit");
    setFormDialogDestination(destination);
    setFormDialogOpen(true);
  }

  function handleFormDialogOpenChange(open: boolean) {
    setFormDialogOpen(open);
    if (!open) {
      setFormDialogDestination(null);
    }
  }

  async function handleDelete(destinationId: string) {
    if (!globalThis.confirm("Delete this destination?")) return;
    try {
      await deleteMut.mutateAsync(destinationId);
    } catch {
      /* ignore */
    }
  }

  const destinations = destinationsQuery.data ?? [];

  return (
    <DashboardShell
      activeNav="destinations"
      headerStatus={healthStatus}
      onSignOut={handleSignOut}
      organizationSlug={organizationSlug}
      user={auth.user}
      orgSwitcher={
        <OrgSwitcher
          disabled={pending && organizations.length === 0}
          onSelectOrganization={handleSelectOrganization}
          organizations={organizations}
          pending={pending}
          selectedOrganizationId={orgId}
        />
      }
    >
      <div className="mx-auto max-w-4xl px-3 py-8 md:px-6">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-semibold text-3xl tracking-tight">
                Destinations
              </h1>
              {destinations.length > 0 ? (
                <Badge variant="secondary">{destinations.length}</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm">
              S3-compatible buckets for this organization.
            </p>
          </div>
          {canManage ? (
            <Button
              className="shrink-0 gap-1.5 self-start sm:self-auto"
              onClick={openCreateDialog}
              type="button"
            >
              <Plus className="size-4" />
              Add
            </Button>
          ) : null}
        </header>

        <section className="mt-10">
          {destinationsQuery.isError ? (
            <p className="text-destructive text-sm">Could not load list.</p>
          ) : destinations.length === 0 && !destinationsQuery.isPending ? (
            <div className="rounded-xl border border-border border-dashed bg-muted/20 px-6 py-16 text-center">
              <p className="font-medium text-foreground">
                No destinations yet
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {canManage
                  ? "Add one to store backups and artifacts."
                  : "Your admins can add destinations here."}
              </p>
              {canManage ? (
                <Button
                  className="mt-6 gap-1.5"
                  onClick={openCreateDialog}
                  type="button"
                >
                  <Plus className="size-4" />
                  Add destination
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">
                      Name
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      Provider
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      Bucket
                    </TableHead>
                    <TableHead className="text-muted-foreground">
                      Region
                    </TableHead>
                    {canManage ? (
                      <TableHead className="text-right text-muted-foreground">
                        Actions
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {destinations.map((destination) => (
                    <TableRow key={destination.id}>
                      <TableCell className="font-medium">
                        {destination.name}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                        {s3ProviderLabel(destination.provider)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {destination.bucket}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {destination.region}
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={() => openEditDialog(destination)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Edit
                            </Button>
                            <Button
                              disabled={deleteMut.isPending}
                              onClick={() => handleDelete(destination.id)}
                              size="sm"
                              type="button"
                              variant="destructive"
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <S3DestinationFormDialog
        destination={formDialogDestination}
        mode={formDialogMode}
        onOpenChange={handleFormDialogOpenChange}
        open={formDialogOpen}
        organizationId={orgId}
      />
    </DashboardShell>
  );
}

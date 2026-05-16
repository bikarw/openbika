import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganizationResponse } from "@openbika/contracts";
import * as React from "react";

import { authClient } from "#/auth-client";
import { DashboardShell } from "#/components/dashboard-shell";
import { OrgSwitcher } from "#/components/org-switcher";
import {
  dashboardKeys,
  fetchHealthOk,
  fetchOrganizations,
  fetchServerDomainSettings,
  patchServerDomainSettingsRequest,
} from "#/lib/dashboard-api-queries";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { Button } from "@openbika/ui/components/button";
import { Input } from "@openbika/ui/components/input";

export const Route = createFileRoute("/_protected/$organizationSlug/settings/")(
  {
    component: OrganizationSettingsRoutePage,
  },
);

function pickOrganization(
  organizations: OrganizationResponse[],
): OrganizationResponse | null {
  if (organizations.length === 0) return null;
  const stored = readStoredOrganizationId();
  const storedOrganization = organizations.find((o) => o.id === stored);
  if (storedOrganization) {
    return storedOrganization;
  }
  return organizations[0] ?? null;
}

function serverDomainStatusLabel(status: string): string {
  switch (status) {
    case "applied":
      return "Domain assigned";
    case "failed":
      return "Setup failed";
    case "not_configured":
      return "No domain assigned";
    default:
      return "No domain assigned";
  }
}

function OrganizationSettingsRoutePage() {
  const { organizationSlug } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  });

  const organizations = orgsQuery.data ?? [];
  const orgId =
    organizations.find((o) => o.slug === organizationSlug)?.id ?? null;

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
      to: "/$organizationSlug/settings",
      params: { organizationSlug: fallback.slug },
      replace: true,
    });
  }, [orgsQuery.data, orgsQuery.isPending, organizationSlug, navigate]);

  const healthQuery = useQuery({
    queryKey: dashboardKeys.health(),
    queryFn: fetchHealthOk,
  });

  const settingsQuery = useQuery({
    queryKey: dashboardKeys.serverDomainSettings(),
    queryFn: fetchServerDomainSettings,
  });

  const pending = orgsQuery.isPending || settingsQuery.isPending;
  const settings = settingsQuery.data ?? null;

  const [domain, setDomain] = React.useState("");
  const [letsEncryptEmail, setLetsEncryptEmail] = React.useState("");
  const [autoSsl, setAutoSsl] = React.useState(false);
  const [formMessage, setFormMessage] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!settings) return;
    setDomain(settings.host ?? "");
    setLetsEncryptEmail(settings.letsEncryptEmail ?? "");
    setAutoSsl(settings.https && settings.certificateType === "letsencrypt");
  }, [settings]);

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
      to: "/$organizationSlug/settings",
      params: { organizationSlug: organization.slug },
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  const patchSettingsMut = useMutation({
    mutationFn: patchServerDomainSettingsRequest,
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(
        dashboardKeys.serverDomainSettings(),
        nextSettings,
      );
    },
  });

  async function handleSaveDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormMessage(null);

    const trimmedDomain = domain.trim();
    const trimmedEmail = letsEncryptEmail.trim();
    if (autoSsl && !trimmedEmail) {
      setFormError(
        "Let's Encrypt email is required when automatic SSL is enabled.",
      );
      return;
    }

    try {
      await patchSettingsMut.mutateAsync({
        certificateType: autoSsl ? "letsencrypt" : "none",
        host: trimmedDomain.length > 0 ? trimmedDomain : null,
        https: autoSsl,
        letsEncryptEmail: trimmedEmail,
      });
      setFormMessage("Domain assigned.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not save server domain settings.",
      );
    }
  }

  return (
    <DashboardShell
      activeNav="settings"
      headerStatus={healthStatus}
      onSignOut={handleSignOut}
      organizationSlug={organizationSlug}
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
      <div className="mx-auto max-w-5xl space-y-4 p-3 md:p-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Manage how you access OpenBika.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Server domain</CardTitle>
            <CardDescription>
              Add a domain to your OpenBika server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSaveDomain}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    className="font-medium text-sm leading-none"
                    htmlFor="settings-server-domain"
                  >
                    Domain
                  </label>
                  <Input
                    id="settings-server-domain"
                    onChange={(event) => setDomain(event.target.value)}
                    placeholder="openbika.example.com"
                    value={domain}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="font-medium text-sm leading-none"
                    htmlFor="settings-letsencrypt-email"
                  >
                    Let&apos;s Encrypt email
                  </label>
                  <Input
                    id="settings-letsencrypt-email"
                    onChange={(event) =>
                      setLetsEncryptEmail(event.target.value)
                    }
                    placeholder="admin@example.com"
                    type="email"
                    value={letsEncryptEmail}
                  />
                </div>
              </div>

              <label
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
                htmlFor="settings-auto-ssl"
              >
                <span>
                  <span className="block font-medium text-sm">
                    Automatically provision SSL certificate
                  </span>
                  <span className="text-muted-foreground text-xs">
                    OpenBika will request and renew a certificate for this
                    domain.
                  </span>
                </span>
                <input
                  checked={autoSsl}
                  className="size-4 rounded border-border accent-primary"
                  id="settings-auto-ssl"
                  onChange={(event) => setAutoSsl(event.target.checked)}
                  type="checkbox"
                />
              </label>

              {settings ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>
                      Status:{" "}
                      <span className="font-medium">
                        {serverDomainStatusLabel(settings.applyStatus)}
                      </span>
                    </span>
                    {settings.lastAppliedAt ? (
                      <span>
                        Last saved:{" "}
                        {new Date(settings.lastAppliedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  {settings.lastError ? (
                    <p className="mt-2 text-destructive">
                      {settings.lastError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {formError ? (
                <p className="text-destructive text-sm">{formError}</p>
              ) : null}
              {formMessage ? (
                <p className="text-muted-foreground text-sm">{formMessage}</p>
              ) : null}

              <div className="flex justify-end">
                <Button disabled={patchSettingsMut.isPending} type="submit">
                  {patchSettingsMut.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

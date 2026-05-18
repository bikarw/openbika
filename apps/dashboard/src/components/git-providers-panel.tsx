import type { GitProviderResponse, GitProviderType } from "@openbika/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import {
  BitbucketIcon,
  GiteaIcon,
  GithubIcon,
  GitlabIcon,
} from "#/components/git-provider-icons";
import {
  GitProviderFormDialog,
  type GitProviderDialogMode,
} from "#/components/git-provider-form-dialog";
import {
  dashboardKeys,
  deleteGitProviderRequest,
  testBitbucketProviderRequest,
  testGiteaProviderRequest,
  testGithubProviderRequest,
  testGitlabProviderRequest,
} from "#/lib/dashboard-api-queries";
import { getDashboardApiClient } from "#/lib/openbika-client";
import { Badge } from "@openbika/ui/components/badge";
import { Button } from "@openbika/ui/components/button";

export interface GitProvidersPanelProps {
  canManage: boolean;
  organizationId: string | null;
  organizationSlug: string;
  providers: GitProviderResponse[];
  providersError: boolean;
  providersPending: boolean;
}

function providerIcon(type: GitProviderType) {
  switch (type) {
    case "github":
      return <GithubIcon className="size-5" />;
    case "gitlab":
      return <GitlabIcon className="size-5" />;
    case "bitbucket":
      return <BitbucketIcon className="size-5" />;
    case "gitea":
      return <GiteaIcon className="size-5" />;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

function providerLabel(type: GitProviderType): string {
  switch (type) {
    case "github":
      return "GitHub";
    case "gitlab":
      return "GitLab";
    case "bitbucket":
      return "Bitbucket";
    case "gitea":
      return "Gitea";
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

interface AddButtonProps {
  type: GitProviderType;
  onClick: (type: GitProviderType) => void;
  disabled?: boolean;
}

function AddProviderButton({ type, onClick, disabled }: AddButtonProps) {
  return (
    <Button
      className="flex items-center gap-1.5"
      disabled={disabled}
      onClick={() => onClick(type)}
      type="button"
      variant="outline"
    >
      <span className="text-current">{providerIcon(type)}</span>
      <span>{providerLabel(type)}</span>
    </Button>
  );
}

function buildActionRequiredHref(
  provider: GitProviderResponse,
  apiBaseUrls: ReturnType<
    ReturnType<typeof getDashboardApiClient>["gitOauthCallbackUrls"]
  >,
): string | null {
  if (provider.isReady) return null;
  const d = provider.details;
  if (d.providerType === "github") {
    if (d.appName) {
      return `${d.appName.replace(/\/$/u, "")}/installations/new?state=gh_setup:${encodeURIComponent(provider.id)}`;
    }
    return null;
  }
  if (d.providerType === "gitlab") {
    if (!d.applicationId || !d.redirectUri) return null;
    const base = d.gitlabUrl.replace(/\/$/u, "");
    const params = new URLSearchParams({
      client_id: d.applicationId,
      redirect_uri: `${d.redirectUri}?gitProviderId=${encodeURIComponent(provider.id)}`,
      response_type: "code",
      scope: "api read_user read_repository",
    });
    return `${base}/oauth/authorize?${params.toString()}`;
  }
  if (d.providerType === "gitea") {
    return apiBaseUrls.giteaAuthorize(provider.id);
  }
  return null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function GitProvidersPanel({
  canManage,
  organizationId,
  organizationSlug: _organizationSlug,
  providers,
  providersError,
  providersPending,
}: GitProvidersPanelProps) {
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] =
    React.useState<GitProviderDialogMode | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [testMessage, setTestMessage] = React.useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  const apiBaseUrls = React.useMemo(
    () => getDashboardApiClient().gitOauthCallbackUrls(),
    [],
  );

  function openCreate(type: GitProviderType) {
    setDialogMode({ kind: "create", providerType: type });
    setDialogOpen(true);
  }

  function openEdit(provider: GitProviderResponse) {
    setDialogMode({ kind: "edit", provider });
    setDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setDialogMode(null);
    }
  }

  const deleteMut = useMutation({
    mutationFn: deleteGitProviderRequest,
    onSuccess: async () => {
      if (organizationId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.gitProviders(organizationId),
        });
      }
    },
  });

  async function handleDelete(provider: GitProviderResponse) {
    if (!globalThis.confirm(`Delete ${provider.name}?`)) return;
    try {
      await deleteMut.mutateAsync(provider.id);
    } catch {
      /* ignore */
    }
  }

  async function handleTest(provider: GitProviderResponse) {
    setTestingId(provider.id);
    setTestMessage(null);
    try {
      let result: { ok: boolean; message: string };
      switch (provider.providerType) {
        case "github":
          result = await testGithubProviderRequest(provider.id);
          break;
        case "gitlab":
          result = await testGitlabProviderRequest(provider.id);
          break;
        case "bitbucket":
          result = await testBitbucketProviderRequest(provider.id);
          break;
        case "gitea":
          result = await testGiteaProviderRequest(provider.id);
          break;
        default: {
          const exhaustive: never = provider.providerType;
          throw new Error(`Unhandled: ${String(exhaustive)}`);
        }
      }
      setTestMessage({ id: provider.id, ...result });
    } catch (error) {
      setTestMessage({
        id: provider.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-3 py-8 md:px-6">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-3xl tracking-tight">Git</h1>
            {providers.length > 0 ? (
              <Badge variant="secondary">{providers.length}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Connect Git providers so you can pull repositories and branches
            into OpenBika.
          </p>
        </div>
      </header>

      {canManage ? (
        <section className="mt-8">
          <p className="mb-2 font-medium text-sm text-foreground">
            Add a provider
          </p>
          <div className="flex flex-wrap gap-2">
            <AddProviderButton onClick={openCreate} type="github" />
            <AddProviderButton onClick={openCreate} type="gitlab" />
            <AddProviderButton onClick={openCreate} type="bitbucket" />
            <AddProviderButton onClick={openCreate} type="gitea" />
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        {providersError ? (
          <p className="text-destructive text-sm">Could not load providers.</p>
        ) : providers.length === 0 && !providersPending ? (
          <div className="rounded-xl border border-border border-dashed bg-muted/20 px-6 py-16 text-center">
            <GitBranch className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">
              No Git providers yet
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {canManage
                ? "Connect one above to pull repositories into OpenBika."
                : "Your admins can connect a Git provider here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {providers.map((provider) => {
              const actionHref = buildActionRequiredHref(provider, apiBaseUrls);
              const isCurrentTest = testMessage?.id === provider.id;
              return (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between"
                  key={provider.id}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
                      {providerIcon(provider.providerType)}
                    </span>
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{provider.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {providerLabel(provider.providerType)} {"\u00B7 "}
                        Added {formatDate(provider.createdAt)}
                      </p>
                      {isCurrentTest && testMessage ? (
                        <p
                          className={
                            testMessage.ok
                              ? "text-muted-foreground text-xs"
                              : "text-destructive text-xs"
                          }
                        >
                          {testMessage.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {provider.isReady ? (
                      <Badge variant="outline">Ready</Badge>
                    ) : (
                      <>
                        <Badge variant="secondary">Action required</Badge>
                        {actionHref ? (
                          <a
                            className="text-primary text-xs underline-offset-2 hover:underline"
                            href={actionHref}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Continue setup
                          </a>
                        ) : null}
                      </>
                    )}
                    {provider.isReady ? (
                      <Button
                        disabled={testingId === provider.id}
                        onClick={() => handleTest(provider)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {testingId === provider.id ? "Testing..." : "Test"}
                      </Button>
                    ) : null}
                    {canManage ? (
                      <>
                        <Button
                          aria-label="Edit"
                          onClick={() => openEdit(provider)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          aria-label="Delete"
                          disabled={
                            deleteMut.isPending &&
                            deleteMut.variables === provider.id
                          }
                          onClick={() => handleDelete(provider)}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!canManage && providers.length === 0 ? null : !canManage ? (
        <div className="mt-6">
          <Button disabled type="button" variant="outline">
            <Plus className="size-4" /> Add
          </Button>
        </div>
      ) : null}

      <GitProviderFormDialog
        mode={dialogMode}
        onOpenChange={handleDialogOpenChange}
        open={dialogOpen}
        organizationId={organizationId}
      />
    </div>
  );
}

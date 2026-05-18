import type { GitProviderResponse, GitProviderType } from "@openbika/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { GithubIcon } from "#/components/git-provider-icons";

import {
  createBitbucketProviderRequest,
  createGiteaProviderRequest,
  createGitlabProviderRequest,
  dashboardKeys,
  patchBitbucketProviderRequest,
  patchGiteaProviderRequest,
  patchGithubProviderRequest,
  patchGitlabProviderRequest,
  prepareGithubManifestRequest,
} from "#/lib/dashboard-api-queries";
import { getDashboardApiClient } from "#/lib/openbika-client";
import { Button } from "@openbika/ui/components/button";
import { Input } from "@openbika/ui/components/input";
import { cn } from "@openbika/ui/lib/utils";

export type GitProviderDialogMode =
  | { kind: "create"; providerType: GitProviderType }
  | { kind: "edit"; provider: GitProviderResponse };

export interface GitProviderFormDialogProps {
  mode: GitProviderDialogMode | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string | null;
}

const labelClassName =
  "text-muted-foreground text-xs font-medium uppercase tracking-wide";

function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

function OptionalMark() {
  return (
    <span className="text-muted-foreground font-normal normal-case">
      {" \u00B7 optional"}
    </span>
  );
}

interface FieldGroupProps {
  htmlFor: string;
  label: React.ReactNode;
  children: React.ReactNode;
  help?: React.ReactNode;
}

function FieldGroup({ htmlFor, label, children, help }: FieldGroupProps) {
  return (
    <div className="space-y-2">
      <label className={labelClassName} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help ? (
        <p className="text-muted-foreground text-xs leading-relaxed">{help}</p>
      ) : null}
    </div>
  );
}

function SectionCard({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/80 bg-card/40 p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <h3 className="mb-3 font-semibold text-foreground text-sm">{title}</h3>
      {children}
    </section>
  );
}

interface FormState {
  // Common
  name: string;
  // GitHub
  ghIsOrganization: boolean;
  ghOrganizationName: string;
  // GitLab
  gitlabUrl: string;
  gitlabInternalUrl: string;
  applicationId: string;
  secret: string;
  redirectUri: string;
  groupName: string;
  // Bitbucket
  username: string;
  email: string;
  apiToken: string;
  appPassword: string;
  workspaceName: string;
  // Gitea
  giteaUrl: string;
  giteaInternalUrl: string;
  clientId: string;
  clientSecret: string;
  // GitHub edit-only
  appName: string;
}

function emptyFormState(): FormState {
  return {
    name: "",
    ghIsOrganization: false,
    ghOrganizationName: "",
    gitlabUrl: "https://gitlab.com",
    gitlabInternalUrl: "",
    applicationId: "",
    secret: "",
    redirectUri: "",
    groupName: "",
    username: "",
    email: "",
    apiToken: "",
    appPassword: "",
    workspaceName: "",
    giteaUrl: "https://gitea.com",
    giteaInternalUrl: "",
    clientId: "",
    clientSecret: "",
    appName: "",
  };
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

export function GitProviderFormDialog({
  mode,
  onOpenChange,
  open,
  organizationId,
}: GitProviderFormDialogProps) {
  const queryClient = useQueryClient();
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const [form, setForm] = React.useState<FormState>(() => emptyFormState());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [postCreateInfo, setPostCreateInfo] = React.useState<
    | { kind: "gitlab-authorize"; authorizeUrl: string }
    | { kind: "gitea-authorize"; authorizeUrl: string }
    | null
  >(null);
  const [editableManifest, setEditableManifest] = React.useState<string>("");

  const lastSyncedManifestKeyRef = React.useRef<string | null>(null);

  const providerType: GitProviderType | null = React.useMemo(() => {
    if (!mode) return null;
    return mode.kind === "create" ? mode.providerType : mode.provider.providerType;
  }, [mode]);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function handleClose() {
      onOpenChange(false);
    }
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open || !mode) return;
    setFormError(null);
    setPostCreateInfo(null);
    if (mode.kind === "create" && mode.providerType === "github") {
      lastSyncedManifestKeyRef.current = null;
    }
    if (mode.kind === "edit") {
      const { provider } = mode;
      const next = emptyFormState();
      next.name = provider.name;
      const d = provider.details;
      if (d.providerType === "github") {
        next.appName = d.appName ?? "";
      } else if (d.providerType === "gitlab") {
        next.gitlabUrl = d.gitlabUrl;
        next.gitlabInternalUrl = d.gitlabInternalUrl ?? "";
        next.applicationId = d.applicationId ?? "";
        next.redirectUri = d.redirectUri ?? "";
        next.groupName = d.groupName ?? "";
      } else if (d.providerType === "bitbucket") {
        next.username = d.username ?? "";
        next.email = d.email ?? "";
        next.workspaceName = d.workspaceName ?? "";
      } else if (d.providerType === "gitea") {
        next.giteaUrl = d.giteaUrl;
        next.giteaInternalUrl = d.giteaInternalUrl ?? "";
        next.clientId = d.clientId ?? "";
        next.redirectUri = d.redirectUri ?? "";
      }
      setForm(next);
    } else {
      const next = emptyFormState();
      // Suggest a sensible default redirect URI based on the API base URL
      const apiBase = getDashboardApiClient().gitOauthCallbackUrls();
      if (mode.providerType === "gitlab") {
        next.redirectUri = apiBase.gitlabCallback;
      } else if (mode.providerType === "gitea") {
        next.redirectUri = apiBase.giteaCallback;
      }
      setForm(next);
    }
  }, [open, mode]);

  const isGithubCreate =
    !!mode &&
    mode.kind === "create" &&
    mode.providerType === "github";

  const [debouncedGh, setDebouncedGh] = React.useState({
    isOrganization: false,
    organizationName: "",
  });

  React.useEffect(() => {
    if (!open || !isGithubCreate) return;
    const h = window.setTimeout(() => {
      setDebouncedGh({
        isOrganization: form.ghIsOrganization,
        organizationName: form.ghIsOrganization
          ? form.ghOrganizationName.trim()
          : "",
      });
    }, 400);
    return () => window.clearTimeout(h);
  }, [
    open,
    isGithubCreate,
    form.ghIsOrganization,
    form.ghOrganizationName,
  ]);

  const ghPrepareEnabled =
    open &&
    isGithubCreate &&
    !!organizationId &&
    (!debouncedGh.isOrganization || debouncedGh.organizationName.length > 0);

  const manifestDedupeKey = React.useMemo(
    () =>
      `${organizationId ?? ""}:${debouncedGh.isOrganization}:${debouncedGh.organizationName}`,
    [organizationId, debouncedGh],
  );

  const githubManifestQuery = useQuery({
    queryFn: () =>
      prepareGithubManifestRequest({
        organizationId: organizationId!,
        isOrganization: debouncedGh.isOrganization,
        organizationName: debouncedGh.isOrganization
          ? debouncedGh.organizationName
          : undefined,
      }),
    queryKey: [
      "github-manifest-draft",
      organizationId,
      debouncedGh.isOrganization,
      debouncedGh.organizationName,
    ] as const,
    enabled: ghPrepareEnabled,
    placeholderData: (prev) => prev,
    retry: 1,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!open) {
      lastSyncedManifestKeyRef.current = null;
      setEditableManifest("");
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !isGithubCreate) return;
    if (!githubManifestQuery.isSuccess || !githubManifestQuery.data) return;
    if (lastSyncedManifestKeyRef.current === manifestDedupeKey) return;
    lastSyncedManifestKeyRef.current = manifestDedupeKey;
    setEditableManifest(githubManifestQuery.data.manifest);
  }, [
    githubManifestQuery.isSuccess,
    githubManifestQuery.data,
    manifestDedupeKey,
    open,
    isGithubCreate,
  ]);

  const createGitlab = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected");
      return createGitlabProviderRequest({
        organizationId,
        name: form.name,
        gitlabUrl: form.gitlabUrl,
        gitlabInternalUrl:
          form.gitlabInternalUrl.trim().length > 0
            ? form.gitlabInternalUrl
            : undefined,
        applicationId: form.applicationId,
        secret: form.secret,
        redirectUri: form.redirectUri,
        groupName:
          form.groupName.trim().length > 0 ? form.groupName : undefined,
      });
    },
  });

  const createBitbucket = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected");
      return createBitbucketProviderRequest({
        organizationId,
        name: form.name,
        username: form.username,
        email: form.email.trim().length > 0 ? form.email : undefined,
        apiToken: form.apiToken,
        workspaceName:
          form.workspaceName.trim().length > 0
            ? form.workspaceName
            : undefined,
      });
    },
  });

  const createGitea = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected");
      return createGiteaProviderRequest({
        organizationId,
        name: form.name,
        giteaUrl: form.giteaUrl,
        giteaInternalUrl:
          form.giteaInternalUrl.trim().length > 0
            ? form.giteaInternalUrl
            : undefined,
        redirectUri: form.redirectUri,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
      });
    },
  });

  const editProvider = useMutation({
    mutationFn: async () => {
      if (!mode || mode.kind !== "edit") {
        throw new Error("No provider to edit");
      }
      const id = mode.provider.id;
      switch (mode.provider.providerType) {
        case "github":
          return patchGithubProviderRequest(id, {
            name: form.name,
            appName: form.appName.trim().length > 0 ? form.appName : undefined,
          });
        case "gitlab":
          return patchGitlabProviderRequest(id, {
            name: form.name,
            gitlabUrl: form.gitlabUrl,
            gitlabInternalUrl:
              form.gitlabInternalUrl.trim().length > 0
                ? form.gitlabInternalUrl
                : null,
            applicationId: form.applicationId,
            secret: form.secret.trim().length > 0 ? form.secret : undefined,
            redirectUri: form.redirectUri,
            groupName: form.groupName.trim().length > 0 ? form.groupName : null,
          });
        case "bitbucket":
          return patchBitbucketProviderRequest(id, {
            name: form.name,
            username: form.username,
            email: form.email.trim().length > 0 ? form.email : null,
            apiToken:
              form.apiToken.trim().length > 0 ? form.apiToken : undefined,
            workspaceName:
              form.workspaceName.trim().length > 0
                ? form.workspaceName
                : null,
          });
        case "gitea":
          return patchGiteaProviderRequest(id, {
            name: form.name,
            giteaUrl: form.giteaUrl,
            giteaInternalUrl:
              form.giteaInternalUrl.trim().length > 0
                ? form.giteaInternalUrl
                : null,
            redirectUri: form.redirectUri,
            clientId: form.clientId,
            clientSecret:
              form.clientSecret.trim().length > 0
                ? form.clientSecret
                : undefined,
          });
        default: {
          const exhaustive: never = mode.provider.providerType;
          throw new Error(`Unhandled provider type: ${String(exhaustive)}`);
        }
      }
    },
  });

  const saving =
    createGitlab.isPending ||
    createBitbucket.isPending ||
    createGitea.isPending ||
    editProvider.isPending;

  async function invalidateAndClose(options?: { leaveOpen?: boolean }) {
    if (organizationId) {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.gitProviders(organizationId),
      });
    }
    if (!options?.leaveOpen) {
      onOpenChange(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!mode) return;
    try {
      if (mode.kind === "edit") {
        await editProvider.mutateAsync();
        await invalidateAndClose();
        return;
      }

      switch (mode.providerType) {
        case "gitlab": {
          const provider = await createGitlab.mutateAsync();
          const details = provider.details;
          if (details.providerType !== "gitlab") {
            await invalidateAndClose();
            return;
          }
          const base = details.gitlabUrl.replace(/\/$/u, "");
          const params = new URLSearchParams({
            client_id: form.applicationId,
            redirect_uri: `${form.redirectUri}?gitProviderId=${encodeURIComponent(provider.id)}`,
            response_type: "code",
            scope: "api read_user read_repository",
          });
          const authorizeUrl = `${base}/oauth/authorize?${params.toString()}`;
          setPostCreateInfo({ kind: "gitlab-authorize", authorizeUrl });
          await invalidateAndClose({ leaveOpen: true });
          return;
        }
        case "bitbucket": {
          await createBitbucket.mutateAsync();
          await invalidateAndClose();
          return;
        }
        case "gitea": {
          const provider = await createGitea.mutateAsync();
          const authorizeUrl = getDashboardApiClient()
            .gitOauthCallbackUrls()
            .giteaAuthorize(provider.id);
          setPostCreateInfo({ kind: "gitea-authorize", authorizeUrl });
          await invalidateAndClose({ leaveOpen: true });
          return;
        }
        case "github": {
          return;
        }
        default: {
          const exhaustive: never = mode.providerType;
          throw new Error(`Unhandled: ${String(exhaustive)}`);
        }
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Request failed.",
      );
    }
  }

  const editing = mode?.kind === "edit";

  function renderFormBody() {
    if (!mode || !providerType) return null;

    const nameField = (
      <FieldGroup
        htmlFor={`${titleId}-name`}
        label={
          <>
            Name
            <RequiredMark />
          </>
        }
      >
        <Input
          autoComplete="off"
          id={`${titleId}-name`}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="My GitHub"
          required
          value={form.name}
        />
      </FieldGroup>
    );

    if (providerType === "github") {
      if (editing) {
        return (
          <>
            {nameField}
            <FieldGroup
              htmlFor={`${titleId}-appname`}
              label={
                <>
                  App URL
                  <OptionalMark />
                </>
              }
              help="HTML URL of the GitHub App (e.g. https://github.com/apps/my-app). Set automatically after OAuth."
            >
              <Input
                autoComplete="off"
                id={`${titleId}-appname`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, appName: e.target.value }))
                }
                value={form.appName}
              />
            </FieldGroup>
          </>
        );
      }
      return null;
    }

    if (providerType === "gitlab") {
      return (
        <>
          {nameField}
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              htmlFor={`${titleId}-gitlab-url`}
              label={
                <>
                  GitLab URL
                  <RequiredMark />
                </>
              }
            >
              <Input
                id={`${titleId}-gitlab-url`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gitlabUrl: e.target.value }))
                }
                placeholder="https://gitlab.com"
                required
                value={form.gitlabUrl}
              />
            </FieldGroup>
            <FieldGroup
              htmlFor={`${titleId}-gitlab-internal`}
              label={
                <>
                  Internal URL
                  <OptionalMark />
                </>
              }
              help="If your GitLab instance is reachable from this server on a different URL than the public one."
            >
              <Input
                id={`${titleId}-gitlab-internal`}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    gitlabInternalUrl: e.target.value,
                  }))
                }
                placeholder="https://gitlab.internal"
                value={form.gitlabInternalUrl}
              />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              htmlFor={`${titleId}-gitlab-app`}
              label={
                <>
                  Application ID
                  <RequiredMark />
                </>
              }
              help="Create an OAuth application in GitLab (User Settings &rarr; Applications)."
            >
              <Input
                autoComplete="off"
                id={`${titleId}-gitlab-app`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, applicationId: e.target.value }))
                }
                required
                value={form.applicationId}
              />
            </FieldGroup>
            <FieldGroup
              htmlFor={`${titleId}-gitlab-secret`}
              label={
                <>
                  Secret
                  {editing ? <OptionalMark /> : <RequiredMark />}
                </>
              }
            >
              <Input
                autoComplete="new-password"
                id={`${titleId}-gitlab-secret`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, secret: e.target.value }))
                }
                required={!editing}
                type="password"
                value={form.secret}
              />
            </FieldGroup>
          </div>
          <FieldGroup
            htmlFor={`${titleId}-gitlab-redirect`}
            label={
              <>
                Redirect URI
                <RequiredMark />
              </>
            }
            help="Use this exact value as the Redirect URI when registering the OAuth application in GitLab."
          >
            <Input
              id={`${titleId}-gitlab-redirect`}
              onChange={(e) =>
                setForm((f) => ({ ...f, redirectUri: e.target.value }))
              }
              required
              value={form.redirectUri}
            />
          </FieldGroup>
          <FieldGroup
            htmlFor={`${titleId}-gitlab-group`}
            label={
              <>
                Group name
                <OptionalMark />
              </>
            }
            help="Restrict repository listing to a specific group."
          >
            <Input
              id={`${titleId}-gitlab-group`}
              onChange={(e) =>
                setForm((f) => ({ ...f, groupName: e.target.value }))
              }
              value={form.groupName}
            />
          </FieldGroup>
        </>
      );
    }

    if (providerType === "bitbucket") {
      return (
        <>
          {nameField}
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              htmlFor={`${titleId}-bb-user`}
              label={
                <>
                  Username
                  <RequiredMark />
                </>
              }
            >
              <Input
                autoComplete="off"
                id={`${titleId}-bb-user`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                required
                value={form.username}
              />
            </FieldGroup>
            <FieldGroup
              htmlFor={`${titleId}-bb-email`}
              label={
                <>
                  Email
                  <OptionalMark />
                </>
              }
            >
              <Input
                id={`${titleId}-bb-email`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                type="email"
                value={form.email}
              />
            </FieldGroup>
          </div>
          <FieldGroup
            htmlFor={`${titleId}-bb-token`}
            label={
              <>
                API Token
                {editing ? <OptionalMark /> : <RequiredMark />}
              </>
            }
            help="Create a token in Bitbucket Account Settings → Access Tokens with repository read access."
          >
            <Input
              autoComplete="new-password"
              id={`${titleId}-bb-token`}
              onChange={(e) =>
                setForm((f) => ({ ...f, apiToken: e.target.value }))
              }
              required={!editing}
              type="password"
              value={form.apiToken}
            />
          </FieldGroup>
          <FieldGroup
            htmlFor={`${titleId}-bb-ws`}
            label={
              <>
                Workspace
                <OptionalMark />
              </>
            }
            help="Workspace slug — leave blank to list repositories you have access to as a member."
          >
            <Input
              id={`${titleId}-bb-ws`}
              onChange={(e) =>
                setForm((f) => ({ ...f, workspaceName: e.target.value }))
              }
              value={form.workspaceName}
            />
          </FieldGroup>
        </>
      );
    }

    if (providerType === "gitea") {
      return (
        <>
          {nameField}
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              htmlFor={`${titleId}-gt-url`}
              label={
                <>
                  Gitea URL
                  <RequiredMark />
                </>
              }
            >
              <Input
                id={`${titleId}-gt-url`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, giteaUrl: e.target.value }))
                }
                placeholder="https://gitea.com"
                required
                value={form.giteaUrl}
              />
            </FieldGroup>
            <FieldGroup
              htmlFor={`${titleId}-gt-internal`}
              label={
                <>
                  Internal URL
                  <OptionalMark />
                </>
              }
            >
              <Input
                id={`${titleId}-gt-internal`}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    giteaInternalUrl: e.target.value,
                  }))
                }
                value={form.giteaInternalUrl}
              />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              htmlFor={`${titleId}-gt-cid`}
              label={
                <>
                  Client ID
                  <RequiredMark />
                </>
              }
              help="Create an OAuth2 application in Gitea (Settings → Applications)."
            >
              <Input
                autoComplete="off"
                id={`${titleId}-gt-cid`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientId: e.target.value }))
                }
                required
                value={form.clientId}
              />
            </FieldGroup>
            <FieldGroup
              htmlFor={`${titleId}-gt-cs`}
              label={
                <>
                  Client Secret
                  {editing ? <OptionalMark /> : <RequiredMark />}
                </>
              }
            >
              <Input
                autoComplete="new-password"
                id={`${titleId}-gt-cs`}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientSecret: e.target.value }))
                }
                required={!editing}
                type="password"
                value={form.clientSecret}
              />
            </FieldGroup>
          </div>
          <FieldGroup
            htmlFor={`${titleId}-gt-redirect`}
            label={
              <>
                Redirect URI
                <RequiredMark />
              </>
            }
            help="Use this exact value as the Redirect URI when registering the OAuth application in Gitea."
          >
            <Input
              id={`${titleId}-gt-redirect`}
              onChange={(e) =>
                setForm((f) => ({ ...f, redirectUri: e.target.value }))
              }
              required
              value={form.redirectUri}
            />
          </FieldGroup>
        </>
      );
    }

    return null;
  }

  function renderGithubCreateFlow() {
    const localhostHit =
      /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::[\d]*)?(?:[\/?#]|$)/iu.test(
        editableManifest,
      );

    const prepared = githubManifestQuery.data;

    const queryErrorDisplay =
      githubManifestQuery.error instanceof Error
        ? githubManifestQuery.error.message
        : githubManifestQuery.isError
          ? "Could not build manifest."
          : null;

    const manifestLoadingInitial =
      ghPrepareEnabled &&
      (githubManifestQuery.isFetching || githubManifestQuery.isPending) &&
      !prepared;

    return (
      <div className="space-y-5">
        <div className="flex gap-3 rounded-xl border border-border/70 bg-muted/25 p-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/60">
            <GithubIcon className="size-6 text-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-base tracking-tight">GitHub</p>
            <p className="text-muted-foreground text-xs leading-snug">
              Register the app on GitHub in a new tab, then finish here when
              you&apos;re redirected back.
            </p>
          </div>
        </div>

        <SectionCard title="Install target">
          <label
            className="flex cursor-pointer gap-3 rounded-lg border border-border/80 bg-background/50 px-4 py-3.5 hover:bg-muted/55"
            htmlFor={`${titleId}-gh-isorg`}
          >
            <input
              checked={form.ghIsOrganization}
              className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
              id={`${titleId}-gh-isorg`}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ghIsOrganization: e.target.checked,
                }))
              }
              type="checkbox"
            />
            <span className="min-w-0">
              <span className="block font-medium text-sm">Organization</span>
              <span className="mt-0.5 block text-muted-foreground text-xs">
                Leave off for a personal GitHub account.
              </span>
            </span>
          </label>
          {form.ghIsOrganization ? (
            <div className="mt-4 space-y-2">
              <label
                className={labelClassName}
                htmlFor={`${titleId}-gh-orgname`}
              >
                Org slug
                <RequiredMark />
              </label>
              <Input
                autoComplete="off"
                id={`${titleId}-gh-orgname`}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    ghOrganizationName: e.target.value,
                  }))
                }
                placeholder="acme"
                value={form.ghOrganizationName}
              />
            </div>
          ) : null}
          {!ghPrepareEnabled && form.ghIsOrganization ? (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
              Organization slug required to generate the manifest.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Manifest">
          {queryErrorDisplay ? (
            <p className="mb-3 text-destructive text-sm">{queryErrorDisplay}</p>
          ) : null}

          {localhostHit ? (
            <div className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2 text-amber-950 text-xs leading-snug dark:text-amber-100">
              Looks like localhost. Prefer a reachable URL — or omit webhooks:
              drop <code className="rounded bg-background/80 px-1 py-px font-mono">hook_attributes</code>{" "}
              and set{" "}
              <code className="rounded bg-background/80 px-1 py-px font-mono">
                default_events
              </code>{" "}
              to{" "}
              <code className="rounded bg-background/80 px-1 py-px font-mono">
                []
              </code>
              .
            </div>
          ) : null}

          {manifestLoadingInitial ? (
            <div className="flex min-h-[12rem] items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin shrink-0" />
              Building manifest…
            </div>
          ) : null}

          {ghPrepareEnabled && !manifestLoadingInitial ? (
            <>
              {(githubManifestQuery.isFetching ||
                githubManifestQuery.isPending) &&
              prepared ? (
                <p className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="size-3.5 animate-spin" />
                  Refreshing manifest…
                </p>
              ) : null}
              <textarea
                className={cn(
                  "min-h-[14rem] w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed",
                  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
                id={`${titleId}-gh-manifest`}
                onChange={(e) => setEditableManifest(e.target.value)}
                spellCheck={false}
                value={editableManifest}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  disabled={!prepared}
                  onClick={() =>
                    prepared
                      ? setEditableManifest(prepared.manifest)
                      : undefined
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reset
                </Button>
              </div>
            </>
          ) : null}
        </SectionCard>
      </div>
    );
  }

  function renderPostCreate() {
    if (!postCreateInfo) return null;
    if (postCreateInfo.kind === "gitlab-authorize") {
      return (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <p className="font-medium text-sm">Authorize on GitLab</p>
          <p className="text-muted-foreground text-sm">
            GitLab will ask you to authorize the OAuth application, then
            redirect back here.
          </p>
          <div className="flex justify-end">
            <a
              className={cn(
                "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-primary-foreground text-sm font-medium",
                "shadow-xs transition-colors hover:bg-primary/90",
              )}
              href={postCreateInfo.authorizeUrl}
              rel="noreferrer"
              target="_blank"
            >
              Authorize GitLab
            </a>
          </div>
        </div>
      );
    }
    if (postCreateInfo.kind === "gitea-authorize") {
      return (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <p className="font-medium text-sm">Authorize on Gitea</p>
          <p className="text-muted-foreground text-sm">
            Gitea will ask you to authorize the OAuth application, then
            redirect back here.
          </p>
          <div className="flex justify-end">
            <a
              className={cn(
                "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-primary-foreground text-sm font-medium",
                "shadow-xs transition-colors hover:bg-primary/90",
              )}
              href={postCreateInfo.authorizeUrl}
              rel="noreferrer"
              target="_blank"
            >
              Authorize Gitea
            </a>
          </div>
        </div>
      );
    }
    return null;
  }

  const ghManifestPostReady =
    githubManifestQuery.isSuccess &&
    Boolean(githubManifestQuery.data?.actionUrl) &&
    editableManifest.trim().length > 0;

  const modalTitle =
    !mode ? "" : mode.kind === "edit"
      ? `Edit ${providerLabel(mode.provider.providerType)} provider`
      : mode.providerType === "github"
        ? "GitHub"
        : `New ${providerLabel(mode.providerType)} provider`;

  return (
    <dialog
      aria-labelledby={titleId}
      className={cn(
        "fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-0 shadow-lg outline-none",
        "[&::backdrop]:bg-black/50 [&::backdrop]:backdrop-blur-[2px]",
      )}
      ref={dialogRef}
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-border border-b px-6 py-4">
          <h2 className="font-semibold text-lg tracking-tight" id={titleId}>
            {modalTitle}
          </h2>
        </div>

        {isGithubCreate ? (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {renderGithubCreateFlow()}
              {formError ? (
                <p className="text-destructive text-sm">{formError}</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-border border-t bg-muted/20 px-6 py-3">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <form
                action={githubManifestQuery.data?.actionUrl}
                className="inline"
                method="post"
                target="_blank"
              >
                <input name="manifest" type="hidden" value={editableManifest} />
                <Button disabled={!ghManifestPostReady} type="submit">
                  Create GitHub App
                </Button>
              </form>
            </div>
          </>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit}
          >
            <div className="space-y-4 overflow-y-auto px-6 py-4">
              {renderPostCreate()}
              {renderFormBody()}
              {formError ? (
                <p className="text-destructive text-sm">{formError}</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-border border-t bg-muted/20 px-6 py-3">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                {postCreateInfo ? "Done" : "Cancel"}
              </Button>
              {!postCreateInfo ? (
                <Button disabled={saving} type="submit">
                  {saving ? "Saving..." : editing ? "Save" : "Continue"}
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

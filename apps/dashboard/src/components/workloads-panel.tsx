import { Link } from "@tanstack/react-router";
import {
  type CreateWorkloadRequest,
  type FunctionRuntime,
  readObservedWorkloadIngressRoutes,
  type WorkloadResponse,
} from "@openbika/contracts";
import { Badge } from "@openbika/ui/components/badge";
import { Button, buttonVariants } from "@openbika/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@openbika/ui/components/dropdown-menu";
import { Input } from "@openbika/ui/components/input";
import { cn } from "@openbika/ui/lib/utils";
import {
  AlertCircle,
  Boxes,
  ChevronsUpDown,
  Code2,
  Container,
  FolderArchive,
  Plus,
  Workflow,
  X,
} from "lucide-react";
import * as React from "react";

import { parseEnvText } from "#/lib/env-text";

const MAX_BUNDLE_FILE_BYTES = 4 * 1024 * 1024;

type WorkloadStatusTone = "neutral" | "ok" | "warn" | "fail";
type WorkloadKind = WorkloadResponse["kind"];

type CreateWorkloadHandler = (input: CreateWorkloadRequest) => Promise<void>;

interface WorkloadsPanelProps {
  errorMessage: string | null;
  navigation?: {
    organizationSlug: string;
    projectSlug: string;
  };
  onCreateWorkload: CreateWorkloadHandler;
  workloads: WorkloadResponse[];
}

export function workloadKindLabel(kind: WorkloadKind): string {
  switch (kind) {
    case "container":
      return "Container";
    case "function":
      return "Function";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function workloadKindIcon(kind: WorkloadKind) {
  return kind === "container" ? Container : Workflow;
}

export function workloadStatusTone(
  status: WorkloadResponse["status"],
): WorkloadStatusTone {
  switch (status) {
    case "available":
      return "ok";
    case "requested":
    case "provisioning":
    case "maintenance":
      return "neutral";
    case "degraded":
      return "warn";
    case "failed":
    case "deleted":
      return "fail";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function workloadObservedError(
  workload: WorkloadResponse,
): string | null {
  const raw = workload.observedState.error;
  return typeof raw === "string" ? raw : null;
}

/** Public ingress URL persisted by the provisioner (`observedState.ingressRoutes` or legacy `publicBaseUrl`). */
export function workloadObservedPublicBaseUrl(
  workload: WorkloadResponse,
): string | null {
  const observed =
    workload.observedState !== null &&
    typeof workload.observedState === "object" &&
    !Array.isArray(workload.observedState)
      ? (workload.observedState as Record<string, unknown>)
      : {};

  const routes = readObservedWorkloadIngressRoutes(observed);
  const primary = routes[0]?.url?.trim();
  if (primary) {
    return primary;
  }

  const raw = observed.publicBaseUrl;
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim()
    : null;
}

export function WorkloadsPanel({
  errorMessage,
  navigation,
  onCreateWorkload,
  workloads,
}: WorkloadsPanelProps) {
  return (
    <div className="grid gap-4">
      {workloads.length > 0 ? (
        <div className="flex justify-end">
          <CreateWorkloadModal
            existingNames={workloads.map((w) => w.name)}
            onCreateWorkload={onCreateWorkload}
          />
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {workloads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40">
              <Boxes className="text-muted-foreground size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">No workloads yet</p>
              <p className="text-muted-foreground text-sm">
                Add a container (e.g. Redis) or a function (Bun / Node) to this
                project.
              </p>
            </div>
            <CreateWorkloadModal
              existingNames={workloads.map((w) => w.name)}
              onCreateWorkload={onCreateWorkload}
              triggerLabel="Add your first workload"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {workloads.map((workload) => (
            <WorkloadCard
              key={workload.id}
              navigation={navigation}
              workload={workload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkloadCard({
  navigation,
  workload,
}: {
  navigation?: {
    organizationSlug: string;
    projectSlug: string;
  };
  workload: WorkloadResponse;
}) {
  const Icon = workloadKindIcon(workload.kind);
  const error = workloadObservedError(workload);

  const card = (
    <Card className="h-full transition-colors hover:bg-muted/30">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
              <Icon className="text-muted-foreground size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {workload.name}
              </CardTitle>
              <CardDescription>
                {workloadKindLabel(workload.kind)}
              </CardDescription>
            </div>
          </div>
          <StatusDot status={workload.status} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {workload.kind === "container" ? (
          <KeyValueRow
            label="Image"
            value={
              typeof workload.desiredState.image === "string"
                ? workload.desiredState.image
                : "—"
            }
          />
        ) : (
          <KeyValueRow
            label="Runtime"
            value={
              typeof workload.desiredState.runtime === "string"
                ? workload.desiredState.runtime
                : "—"
            }
          />
        )}
        {error ? (
          <p className="text-destructive flex items-start gap-1.5 text-xs leading-snug">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (navigation) {
    return (
      <Link
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        params={{
          organizationSlug: navigation.organizationSlug,
          projectSlug: navigation.projectSlug,
          workloadId: workload.id,
        }}
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId"
      >
        {card}
      </Link>
    );
  }

  return card;
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-foreground">
        {value}
      </span>
    </div>
  );
}

export function StatusDot({
  status,
}: {
  status: WorkloadResponse["status"];
}) {
  const tone = workloadStatusTone(status);
  const dotClass = (() => {
    switch (tone) {
      case "ok":
        return "bg-emerald-500";
      case "neutral":
        return "bg-amber-500 animate-pulse";
      case "warn":
        return "bg-amber-500";
      case "fail":
        return "bg-destructive";
      default: {
        const exhaustive: never = tone;
        return exhaustive;
      }
    }
  })();

  return (
    <Badge className="gap-1.5" variant="outline">
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      <span className="text-xs">{status}</span>
    </Badge>
  );
}

interface CreateWorkloadModalProps {
  existingNames: string[];
  onCreateWorkload: CreateWorkloadHandler;
  triggerLabel?: string;
}

function CreateWorkloadModal({
  existingNames,
  onCreateWorkload,
  triggerLabel = "New workload",
}: CreateWorkloadModalProps) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<WorkloadKind>("container");
  const [name, setName] = React.useState("");
  const [image, setImage] = React.useState("");
  const [portsText, setPortsText] = React.useState("");
  const [envText, setEnvText] = React.useState("");
  const [runtime, setRuntime] = React.useState<FunctionRuntime>("bun");
  const [entrypoint, setEntrypoint] = React.useState("index.ts");
  const [sourceType, setSourceType] = React.useState<
    "git" | "image" | "bundle"
  >("git");
  const [repositoryUrl, setRepositoryUrl] = React.useState("");
  const [gitRef, setGitRef] = React.useState("");
  const [gitPath, setGitPath] = React.useState("");
  const [imageRef, setImageRef] = React.useState("");
  const [artifactUriText, setArtifactUriText] = React.useState("");
  const [bundleFromDevice, setBundleFromDevice] = React.useState<{
    dataUrl: string;
    filename: string;
  } | null>(null);
  const bundleFileInputRef = React.useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  function reset() {
    setKind("container");
    setName("");
    setImage("");
    setPortsText("");
    setEnvText("");
    setRuntime("bun");
    setEntrypoint("index.ts");
    setSourceType("git");
    setRepositoryUrl("");
    setGitRef("");
    setGitPath("");
    setImageRef("");
    setArtifactUriText("");
    setBundleFromDevice(null);
    if (bundleFileInputRef.current) {
      bundleFileInputRef.current.value = "";
    }
    setErrorMessage(null);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  function parsePorts(): number[] | undefined {
    const trimmed = portsText.trim();
    if (!trimmed) return undefined;

    const tokens = trimmed.split(/[,\s]+/u).filter(Boolean);
    const numbers: number[] = [];

    for (const token of tokens) {
      const value = Number(token);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid port: ${token}`);
      }
      numbers.push(value);
    }

    return numbers.length > 0 ? numbers : undefined;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Workload name is required.");
      return;
    }

    if (existingNames.includes(trimmedName)) {
      setErrorMessage("A workload with this name already exists.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const ports = parsePorts();
      let env: Record<string, string> | undefined;
      const envTrimmed = envText.trim();
      if (envTrimmed) {
        env = parseEnvText(envText);
        if (Object.keys(env).length === 0) {
          env = undefined;
        }
      }
      let payload: CreateWorkloadRequest;

      if (kind === "container") {
        const trimmedImage = image.trim();
        if (!trimmedImage) {
          throw new Error("Container workload requires an image reference.");
        }

        payload = {
          env,
          image: trimmedImage,
          kind: "container",
          name: trimmedName,
          ports,
        };
      } else {
        const source = (() => {
          if (sourceType === "git") {
            const trimmedRepo = repositoryUrl.trim();
            if (!trimmedRepo) {
              throw new Error(
                "Git source requires a repository URL.",
              );
            }
            return {
              path: gitPath.trim() || undefined,
              ref: gitRef.trim() || undefined,
              repositoryUrl: trimmedRepo,
              type: "git" as const,
            };
          }

          if (sourceType === "image") {
            const trimmed = imageRef.trim();
            if (!trimmed) {
              throw new Error("Image source requires an image reference.");
            }
            return { image: trimmed, type: "image" as const };
          }

          if (bundleFromDevice?.dataUrl) {
            return {
              artifactUri: bundleFromDevice.dataUrl,
              type: "bundle" as const,
            };
          }
          const trimmed = artifactUriText.trim();
          if (!trimmed) {
            throw new Error(
              "Bundle source requires an artifact URI or a zip/tar file from this device.",
            );
          }
          return { artifactUri: trimmed, type: "bundle" as const };
        })();

        payload = {
          entrypoint: entrypoint.trim() || "index.ts",
          env,
          kind: "function",
          name: trimmedName,
          runtime,
          source,
        };
      }

      await onCreateWorkload(payload);
      setOpen(false);
      reset();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create workload",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <Plus className="size-4" />
        {triggerLabel}
      </Button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 text-left backdrop-blur-sm"
          role="dialog"
        >
          <form
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="flex items-start justify-between gap-4 border-border border-b p-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  Create workload
                </h2>
                <p className="text-muted-foreground text-sm">
                  Add a container or function service to this project.
                </p>
              </div>
              <Button
                aria-label="Close create workload modal"
                disabled={submitting}
                onClick={close}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                <KindCard
                  active={kind === "container"}
                  description="Long-running image (Redis, Nginx)"
                  icon={<Container className="size-4" />}
                  label="Container"
                  onClick={() => setKind("container")}
                />
                <KindCard
                  active={kind === "function"}
                  description="Bun or Node serverless handler"
                  icon={<Workflow className="size-4" />}
                  label="Function"
                  onClick={() => setKind("function")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="workload-name">
                  Workload name
                </label>
                <Input
                  autoFocus
                  id="workload-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder={kind === "container" ? "redis" : "api"}
                  value={name}
                />
              </div>

              {kind === "container" ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="image">
                      Image
                    </label>
                    <Input
                      id="image"
                      onChange={(event) => setImage(event.target.value)}
                      placeholder="docker.io/redis:7"
                      value={image}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="ports">
                      Ports
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (comma or space separated)
                      </span>
                    </label>
                    <Input
                      id="ports"
                      onChange={(event) => setPortsText(event.target.value)}
                      placeholder="6379"
                      value={portsText}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Runtime</p>
                    <RuntimePicker runtime={runtime} setRuntime={setRuntime} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="entrypoint">
                      Entrypoint
                    </label>
                    <Input
                      id="entrypoint"
                      onChange={(event) => setEntrypoint(event.target.value)}
                      placeholder="index.ts"
                      value={entrypoint}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Source</p>
                    <SourceTypePicker
                      setSourceType={setSourceType}
                      sourceType={sourceType}
                    />

                    {sourceType === "git" ? (
                      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                        <Input
                          onChange={(event) =>
                            setRepositoryUrl(event.target.value)
                          }
                          placeholder="https://github.com/org/repo"
                          value={repositoryUrl}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            onChange={(event) => setGitRef(event.target.value)}
                            placeholder="ref (branch / sha)"
                            value={gitRef}
                          />
                          <Input
                            onChange={(event) => setGitPath(event.target.value)}
                            placeholder="path (optional)"
                            value={gitPath}
                          />
                        </div>
                      </div>
                    ) : sourceType === "image" ? (
                      <Input
                        onChange={(event) => setImageRef(event.target.value)}
                        placeholder="ghcr.io/org/image:tag"
                        value={imageRef}
                      />
                    ) : (
                      <div className="space-y-2">
                        <input
                          accept=".zip,.tar,.tgz,.gz,application/x-tar,application/gzip,application/zip"
                          aria-label="Choose bundle zip or tar file"
                          className="sr-only size-0 overflow-hidden border-0 p-0"
                          onChange={(event) => {
                            const input = event.currentTarget;
                            const file = input.files?.[0];
                            if (!file) {
                              return;
                            }
                            input.value = "";
                            if (file.size > MAX_BUNDLE_FILE_BYTES) {
                              const mb = MAX_BUNDLE_FILE_BYTES / (1024 * 1024);
                              setErrorMessage(
                                `Choose a bundle of ${mb} MB or smaller, or paste an artifact URI instead.`,
                              );
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const data = reader.result;
                              if (typeof data !== "string") {
                                setErrorMessage(
                                  "Could not read the selected file.",
                                );
                                return;
                              }
                              setErrorMessage(null);
                              setArtifactUriText("");
                              setBundleFromDevice({
                                dataUrl: data,
                                filename: file.name,
                              });
                            };
                            reader.onerror = () => {
                              setErrorMessage(
                                "Could not read the selected file.",
                              );
                            };
                            reader.readAsDataURL(file);
                          }}
                          ref={bundleFileInputRef}
                          tabIndex={-1}
                          type="file"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                          <Input
                            className="min-w-0 flex-1"
                            disabled={bundleFromDevice !== null}
                            id="artifact-uri"
                            onChange={(event) => {
                              setArtifactUriText(event.target.value);
                              setBundleFromDevice(null);
                            }}
                            placeholder="s3://bucket/bundle.zip"
                            value={artifactUriText}
                          />
                          <div className="flex shrink-0 gap-2">
                            {bundleFromDevice ? (
                              <Button
                                className="shrink-0"
                                disabled={submitting}
                                onClick={() => {
                                  setBundleFromDevice(null);
                                  if (bundleFileInputRef.current) {
                                    bundleFileInputRef.current.value = "";
                                  }
                                }}
                                type="button"
                                variant="outline"
                              >
                                Clear file
                              </Button>
                            ) : null}
                            <Button
                              className="inline-flex shrink-0 items-center gap-2"
                              disabled={submitting}
                              onClick={() =>
                                bundleFileInputRef.current?.click()
                              }
                              type="button"
                              variant="outline"
                            >
                              <FolderArchive className="size-4 shrink-0" />
                              Choose file…
                            </Button>
                          </div>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Paste an artifact URI, or attach a zip/tar from this
                          device (up to {MAX_BUNDLE_FILE_BYTES / (1024 * 1024)}{" "}
                          MB).
                        </p>
                        {bundleFromDevice ? (
                          <p className="text-muted-foreground text-xs">
                            Using local file:{" "}
                            <span className="break-all font-mono text-foreground">
                              {bundleFromDevice.filename}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="env">
                  Environment variables
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    (KEY=value per line)
                  </span>
                </label>
                <textarea
                  className={cn(
                    "min-h-[96px] w-full rounded-md border border-border bg-background p-2 font-mono text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  id="env"
                  onChange={(event) => setEnvText(event.target.value)}
                  placeholder="LOG_LEVEL=info"
                  value={envText}
                />
              </div>

              {errorMessage ? (
                <p className="text-destructive text-sm" role="alert">
                  {errorMessage}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-border border-t p-4">
              <Button
                disabled={submitting}
                onClick={close}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={submitting} type="submit">
                {submitting ? "Creating…" : "Create workload"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function KindCard({
  active,
  description,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:bg-accent/50",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </button>
  );
}

function RuntimePicker({
  runtime,
  setRuntime,
}: {
  runtime: FunctionRuntime;
  setRuntime: (next: FunctionRuntime) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-start",
        )}
      >
        <Code2 className="size-4" />
        <span className="truncate">{runtime}</span>
        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Function runtime
        </DropdownMenuLabel>
        {(["bun", "node"] as const).map((option) => (
          <DropdownMenuItem
            className="gap-2 p-2"
            key={option}
            onClick={() => setRuntime(option)}
          >
            <Code2 className="size-4 opacity-70" />
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SourceTypePicker({
  setSourceType,
  sourceType,
}: {
  setSourceType: (next: "git" | "image" | "bundle") => void;
  sourceType: "git" | "image" | "bundle";
}) {
  const options = [
    { description: "Pull from a Git repository", value: "git" as const },
    { description: "Pre-built container image", value: "image" as const },
    { description: "Uploaded artifact (zip/tar)", value: "bundle" as const },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-start",
        )}
      >
        <span className="capitalize">{sourceType}</span>
        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Source
        </DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            className="gap-2 p-2"
            key={option.value}
            onClick={() => setSourceType(option.value)}
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-medium capitalize">{option.value}</span>
              <span className="text-muted-foreground text-xs">
                {option.description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

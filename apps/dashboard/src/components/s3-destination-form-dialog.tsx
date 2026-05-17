import {
  type PatchS3DestinationRequest,
  type S3DestinationResponse,
  s3DestinationAdditionalFlagErrorMessage,
  s3DestinationAdditionalFlagRegex,
} from "@openbika/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { dashboardKeys } from "#/lib/dashboard-api-queries";
import { getDashboardApiClient } from "#/lib/openbika-client";
import {
  S3_PROVIDERS,
  computeS3Endpoint,
  getS3ProviderDescriptor,
  type S3ProviderDescriptor,
} from "#/lib/s3-providers";
import { Button } from "@openbika/ui/components/button";
import { Input } from "@openbika/ui/components/input";
import { cn } from "@openbika/ui/lib/utils";

export interface S3DestinationFormDialogProps {
  destination: S3DestinationResponse | null;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string | null;
}

function parseAdditionalFlagLines(raw: string): string[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function validateAdditionalFlags(flags: string[]): string | null {
  for (const flag of flags) {
    if (!s3DestinationAdditionalFlagRegex.test(flag)) {
      return s3DestinationAdditionalFlagErrorMessage;
    }
  }
  return null;
}

const selectClassName = cn(
  "flex h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow]",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
);

const textareaClassName = cn(
  "flex min-h-[80px] w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
);

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
      {" · optional"}
    </span>
  );
}

interface FormState {
  accessKey: string;
  additionalFlagsRaw: string;
  bucket: string;
  endpoint: string;
  helperValues: Record<string, string>;
  name: string;
  provider: string;
  region: string;
  secretAccessKey: string;
}

function emptyFormState(provider: string = "AWS"): FormState {
  const descriptor = getS3ProviderDescriptor(provider);
  return {
    accessKey: "",
    additionalFlagsRaw: "",
    bucket: "",
    endpoint: descriptor.defaultEndpoint ?? "",
    helperValues: {},
    name: "",
    provider,
    region: descriptor.defaultRegion ?? "",
    secretAccessKey: "",
  };
}

/** Back out helper-field values (e.g. R2 accountId) from a saved endpoint URL. */
function deriveHelperValues(
  descriptor: S3ProviderDescriptor,
  endpoint: string,
  region: string,
): Record<string, string> {
  if (!descriptor.endpointTemplate || !descriptor.helperFields) return {};
  const escapedTemplate = descriptor.endpointTemplate.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const tokens = Array.from(escapedTemplate.matchAll(/\\\{(\w+)\\\}/gu)).map(
    (m) => m[1] as string,
  );
  if (tokens.length === 0) return {};
  const pattern =
    "^" +
    escapedTemplate.replace(/\\\{(\w+)\\\}/gu, "([^/]+)") +
    "$";
  const match = new RegExp(pattern, "u").exec(endpoint);
  if (!match) return {};
  const result: Record<string, string> = {};
  tokens.forEach((name, idx) => {
    const captured = match[idx + 1] ?? "";
    if (name === "region") {
      if (captured !== region) {
        result.region = captured;
      }
    } else {
      result[name] = captured;
    }
  });
  return result;
}

export function S3DestinationFormDialog({
  destination,
  mode,
  onOpenChange,
  open,
  organizationId,
}: S3DestinationFormDialogProps) {
  const queryClient = useQueryClient();
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const [form, setForm] = React.useState<FormState>(() => emptyFormState());
  const [formError, setFormError] = React.useState<string | null>(null);

  const descriptor = React.useMemo(
    () => getS3ProviderDescriptor(form.provider),
    [form.provider],
  );

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
    if (!open) return;
    setFormError(null);
    if (mode === "edit" && destination) {
      const providerKey = destination.provider ?? "Other";
      const providerDescriptor = getS3ProviderDescriptor(providerKey);
      setForm({
        accessKey: destination.accessKey,
        additionalFlagsRaw: destination.additionalFlags.join("\n"),
        bucket: destination.bucket,
        endpoint: destination.endpoint,
        helperValues: deriveHelperValues(
          providerDescriptor,
          destination.endpoint,
          destination.region,
        ),
        name: destination.name,
        provider: providerKey,
        region: destination.region,
        secretAccessKey: "",
      });
    } else {
      setForm(emptyFormState());
    }
  }, [open, mode, destination]);

  function handleProviderChange(nextProvider: string) {
    setForm((prev) => {
      const nextDescriptor = getS3ProviderDescriptor(nextProvider);
      const nextRegion = nextDescriptor.defaultRegion ?? prev.region;
      const nextHelpers: Record<string, string> = {};
      const computed = computeS3Endpoint(
        nextDescriptor,
        nextRegion,
        nextHelpers,
      );
      const nextEndpoint =
        computed ?? nextDescriptor.defaultEndpoint ?? prev.endpoint;
      return {
        ...prev,
        endpoint: nextEndpoint,
        helperValues: nextHelpers,
        provider: nextProvider,
        region: nextRegion,
      };
    });
  }

  function handleRegionChange(nextRegion: string) {
    setForm((prev) => {
      const computed = computeS3Endpoint(
        descriptor,
        nextRegion,
        prev.helperValues,
      );
      return {
        ...prev,
        endpoint: computed ?? prev.endpoint,
        region: nextRegion,
      };
    });
  }

  function handleHelperChange(key: string, value: string) {
    setForm((prev) => {
      const helperValues = { ...prev.helperValues, [key]: value };
      const computed = computeS3Endpoint(
        descriptor,
        prev.region,
        helperValues,
      );
      return {
        ...prev,
        endpoint: computed ?? prev.endpoint,
        helperValues,
      };
    });
  }

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected");
      const flags = parseAdditionalFlagLines(form.additionalFlagsRaw);
      const flagErr = validateAdditionalFlags(flags);
      if (flagErr) throw new Error(flagErr);

      return getDashboardApiClient().createS3Destination({
        accessKey: form.accessKey,
        additionalFlags: flags.length > 0 ? flags : undefined,
        bucket: form.bucket,
        endpoint: form.endpoint,
        name: form.name,
        organizationId,
        provider: form.provider,
        region: form.region,
        secretAccessKey: form.secretAccessKey,
      });
    },
    onSuccess: async () => {
      if (organizationId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.s3Destinations(organizationId),
        });
      }
      onOpenChange(false);
    },
  });

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!destination) throw new Error("Nothing to update");
      const flags = parseAdditionalFlagLines(form.additionalFlagsRaw);
      const flagErr = validateAdditionalFlags(flags);
      if (flagErr) throw new Error(flagErr);

      const body: PatchS3DestinationRequest = {
        accessKey: form.accessKey,
        bucket: form.bucket,
        endpoint: form.endpoint,
        name: form.name,
        provider: form.provider,
        region: form.region,
      };
      if (flags.length > 0 || form.additionalFlagsRaw.trim() === "") {
        body.additionalFlags = flags;
      }
      if (form.secretAccessKey.trim().length > 0) {
        body.secretAccessKey = form.secretAccessKey;
      }

      return getDashboardApiClient().patchS3Destination(destination.id, body);
    },
    onSuccess: async () => {
      if (organizationId) {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.s3Destinations(organizationId),
        });
      }
      onOpenChange(false);
    },
  });

  const saving = createMut.isPending || patchMut.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const flags = parseAdditionalFlagLines(form.additionalFlagsRaw);
    const flagErr = validateAdditionalFlags(flags);
    if (flagErr) {
      setFormError(flagErr);
      return;
    }

    try {
      if (mode === "edit") {
        await patchMut.mutateAsync();
      } else {
        await createMut.mutateAsync();
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Request failed.",
      );
    }
  }

  const editing = mode === "edit";
  const showEndpointField = !descriptor.endpointHidden;

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
        <div className="border-border border-b px-5 py-4">
          <h2 className="font-semibold text-lg tracking-tight" id={titleId}>
            {editing ? "Edit destination" : "New destination"}
          </h2>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <p className="text-muted-foreground text-xs">
              Fields marked with <span className="text-destructive">*</span> are
              required.
            </p>

            <div className="space-y-2">
              <label
                className={labelClassName}
                htmlFor={`${titleId}-name`}
              >
                Name
                <RequiredMark />
              </label>
              <Input
                id={`${titleId}-name`}
                onChange={(event) =>
                  setForm((f) => ({ ...f, name: event.target.value }))
                }
                required
                value={form.name}
              />
            </div>

            <div className="space-y-2">
              <label
                className={labelClassName}
                htmlFor={`${titleId}-provider`}
              >
                Provider
                <RequiredMark />
              </label>
              <select
                className={selectClassName}
                id={`${titleId}-provider`}
                onChange={(event) => handleProviderChange(event.target.value)}
                required
                value={form.provider}
              >
                {S3_PROVIDERS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
              {descriptor.note ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {descriptor.note}
                </p>
              ) : null}
            </div>

            {descriptor.helperFields?.map((helper) => (
              <div className="space-y-2" key={helper.key}>
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-helper-${helper.key}`}
                >
                  {helper.label}
                  <RequiredMark />
                </label>
                <Input
                  id={`${titleId}-helper-${helper.key}`}
                  onChange={(event) =>
                    handleHelperChange(helper.key, event.target.value)
                  }
                  placeholder={helper.placeholder}
                  required
                  value={form.helperValues[helper.key] ?? ""}
                />
                {helper.helpText ? (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {helper.helpText}
                  </p>
                ) : null}
              </div>
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-access`}
                >
                  {descriptor.accessKeyLabel}
                  <RequiredMark />
                </label>
                <Input
                  autoComplete="off"
                  id={`${titleId}-access`}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, accessKey: event.target.value }))
                  }
                  placeholder={descriptor.accessKeyPlaceholder}
                  required
                  value={form.accessKey}
                />
              </div>
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-secret`}
                >
                  {descriptor.secretKeyLabel}
                  {editing ? <OptionalMark /> : <RequiredMark />}
                </label>
                <Input
                  autoComplete="new-password"
                  id={`${titleId}-secret`}
                  onChange={(event) =>
                    setForm((f) => ({
                      ...f,
                      secretAccessKey: event.target.value,
                    }))
                  }
                  placeholder={descriptor.secretKeyPlaceholder}
                  required={!editing}
                  type="password"
                  value={form.secretAccessKey}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-bucket`}
                >
                  {descriptor.bucketLabel}
                  <RequiredMark />
                </label>
                <Input
                  id={`${titleId}-bucket`}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, bucket: event.target.value }))
                  }
                  placeholder={descriptor.bucketPlaceholder}
                  required
                  value={form.bucket}
                />
              </div>
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-region`}
                >
                  {descriptor.regionLabel}
                  <RequiredMark />
                </label>
                {descriptor.regions ? (
                  <select
                    className={selectClassName}
                    id={`${titleId}-region`}
                    onChange={(event) => handleRegionChange(event.target.value)}
                    required
                    value={form.region}
                  >
                    {!descriptor.regions.some(
                      (r) => r.value === form.region,
                    ) && form.region !== "" ? (
                      <option value={form.region}>{form.region}</option>
                    ) : null}
                    {descriptor.regions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`${titleId}-region`}
                    onChange={(event) => handleRegionChange(event.target.value)}
                    placeholder={descriptor.regionPlaceholder}
                    required
                    value={form.region}
                  />
                )}
              </div>
            </div>

            {showEndpointField ? (
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-endpoint`}
                >
                  Endpoint
                  {descriptor.endpointTemplate === undefined ? (
                    <RequiredMark />
                  ) : (
                    <OptionalMark />
                  )}
                </label>
                <Input
                  id={`${titleId}-endpoint`}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, endpoint: event.target.value }))
                  }
                  placeholder={descriptor.endpointPlaceholder}
                  required={descriptor.endpointTemplate === undefined}
                  value={form.endpoint}
                />
              </div>
            ) : form.endpoint ? (
              <div className="space-y-2">
                <span className={labelClassName}>Endpoint</span>
                <p className="break-all rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 font-mono text-muted-foreground text-xs">
                  {form.endpoint}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                className={labelClassName}
                htmlFor={`${titleId}-flags`}
              >
                Flags
                <OptionalMark />
              </label>
              <textarea
                className={textareaClassName}
                id={`${titleId}-flags`}
                onChange={(event) =>
                  setForm((f) => ({
                    ...f,
                    additionalFlagsRaw: event.target.value,
                  }))
                }
                placeholder="One flag per line"
                value={form.additionalFlagsRaw}
              />
            </div>

            {formError ? (
              <p className="text-destructive text-sm">{formError}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-border border-t px-5 py-4">
            <Button
              disabled={saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

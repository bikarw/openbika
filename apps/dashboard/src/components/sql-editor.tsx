import type {
  BranchQueryResponse,
  BranchSchemaResponse,
  BranchSchemaTableResponse,
} from "@openbika/contracts";
import { Badge } from "@openbika/ui/components/badge";
import { Button } from "@openbika/ui/components/button";
import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap } from "@codemirror/commands";
import { sql, PostgreSQL, type SQLNamespace } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  AlertTriangle,
  Check,
  Keyboard,
  Play,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import * as React from "react";
import { basicSetup } from "codemirror";

import { useMutation, useQuery } from "@tanstack/react-query";

import { SchemaStatusSkeleton } from "#/components/loading-placeholders";
import { QueryResultTable } from "#/components/query-result-table";
import {
  dashboardKeys,
  executeBranchSql,
  fetchBranchSchema,
} from "#/lib/dashboard-api-queries";

const defaultQuery = "select 1;";

interface SqlEditorProps {
  branchId: string;
  branchName: string;
  databaseName: string;
}

function buildCompletionSchema(
  tables: BranchSchemaTableResponse[],
): SQLNamespace {
  const namespace: Record<string, SQLNamespace> = {};

  for (const table of tables) {
    const columns = table.columns.map((column) => column.name);
    const schemaNamespace =
      typeof namespace[table.schema] === "object" &&
      !Array.isArray(namespace[table.schema])
        ? (namespace[table.schema] as Record<string, SQLNamespace>)
        : {};

    schemaNamespace[table.name] = columns;
    namespace[table.schema] = schemaNamespace;

    if (!namespace[table.name]) {
      namespace[table.name] = columns;
    }
  }

  return namespace;
}

function createEditorTheme() {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "0.875rem",
      height: "100%",
    },
    ".cm-content": {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      minHeight: "100%",
      padding: "1rem",
    },
    ".cm-gutters": {
      backgroundColor: "color-mix(in oklab, var(--muted) 35%, transparent)",
      borderRightColor: "var(--border)",
      color: "var(--muted-foreground)",
    },
    ".cm-scroller": {
      borderRadius: "0.75rem",
    },
  });
}

export function SqlEditor({
  branchId,
  branchName,
  databaseName,
}: SqlEditorProps) {
  const editorContainerRef = React.useRef<HTMLDivElement | null>(null);
  const editorViewRef = React.useRef<EditorView | null>(null);
  const runQueryRef = React.useRef<() => void>(() => undefined);
  const queryRef = React.useRef(defaultQuery);
  const schemaQuery = useQuery({
    queryKey: dashboardKeys.branchSchema(branchId),
    queryFn: () => fetchBranchSchema(branchId),
  });
  const schema = schemaQuery.data ?? null;
  const schemaError =
    schemaQuery.error instanceof Error
      ? schemaQuery.error.message
      : schemaQuery.isError
        ? "Failed to load branch schema"
        : null;
  const schemaLoading = schemaQuery.isPending;
  const [readOnly, setReadOnly] = React.useState(true);
  const [writeModeConfirmed, setWriteModeConfirmed] = React.useState(false);
  const [result, setResult] = React.useState<BranchQueryResponse | null>(null);
  const [queryError, setQueryError] = React.useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: (args: { readOnly: boolean; sql: string }) =>
      executeBranchSql(branchId, args),
  });

  async function runQuery() {
    const sqlText =
      editorViewRef.current?.state.doc.toString() ?? queryRef.current;
    const trimmed = sqlText.trim();

    if (!trimmed) {
      setQueryError("Enter a SQL statement before running.");
      return;
    }

    if (!readOnly && !writeModeConfirmed) {
      setQueryError("Confirm write mode before running non-read-only SQL.");
      return;
    }

    setQueryError(null);
    setResult(null);

    try {
      const nextResult = await runMutation.mutateAsync({
        readOnly,
        sql: trimmed,
      });
      setResult(nextResult);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Query failed");
    }
  }

  runQueryRef.current = () => {
    void runQuery();
  };

  React.useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: queryRef.current,
        extensions: [
          basicSetup,
          sql({
            defaultSchema: "public",
            dialect: PostgreSQL,
            schema: buildCompletionSchema(schema?.tables ?? []),
            upperCaseKeywords: true,
          }),
          autocompletion(),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                runQueryRef.current();
                return true;
              },
            },
            ...defaultKeymap,
          ]),
          EditorView.lineWrapping,
          createEditorTheme(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              queryRef.current = update.state.doc.toString();
            }
          }),
        ],
      }),
    });

    editorViewRef.current = view;
    return () => {
      view.destroy();
      if (editorViewRef.current === view) {
        editorViewRef.current = null;
      }
    };
  }, [branchId, schema?.tables]);

  function toggleReadOnly() {
    setReadOnly((current) => {
      const next = !current;
      if (next) {
        setWriteModeConfirmed(false);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">SQL Runner</h2>
              <Badge className="gap-1.5" variant="outline">
                {readOnly ? (
                  <ShieldCheck className="size-3" />
                ) : (
                  <ShieldOff className="size-3" />
                )}
                {readOnly ? "Read-only" : "Writes enabled"}
              </Badge>
              {!schemaLoading && !schemaError ? (
                <Badge className="gap-1.5" variant="outline">
                  <Check className="size-3" />
                  Schema loaded
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-muted-foreground text-xs">
              {branchName} · {databaseName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={toggleReadOnly}
              size="sm"
              type="button"
              variant="secondary"
            >
              {readOnly ? "Allow writes" : "Use read-only"}
            </Button>
            <Button
              disabled={runMutation.isPending}
              onClick={() => void runQuery()}
              size="sm"
              type="button"
            >
              <Play className="size-4" />
              {runMutation.isPending ? "Running..." : "Run"}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {!readOnly && !writeModeConfirmed ? (
            <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>
                  Write mode can change data or schema on this branch. Confirm
                  before running non-read-only SQL.
                </p>
              </div>
              <Button
                onClick={() => setWriteModeConfirmed(true)}
                type="button"
                variant="destructive"
              >
                Enable write mode
              </Button>
            </div>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-muted-foreground">
              {schemaLoading ? <SchemaStatusSkeleton /> : null}
              {schemaError ? (
                <span className="text-destructive" role="alert">
                  {schemaError}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Keyboard className="size-3.5" />
              <span>
                <kbd className="rounded border border-border bg-muted px-1 py-0.5">
                  Cmd/Ctrl
                </kbd>{" "}
                +{" "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5">
                  Enter
                </kbd>{" "}
                to run
              </span>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
            ref={editorContainerRef}
          />
        </div>
      </section>

      {queryError ? (
        <p
          className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
          role="alert"
        >
          {queryError}
        </p>
      ) : null}

      <section className="flex max-h-[min(22rem,45dvh)] min-h-[11rem] flex-[0_1_38%] flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex h-10 shrink-0 items-center justify-between border-border border-b px-4">
          <div className="font-medium text-sm">Results</div>
          {result ? (
            <p className="text-muted-foreground text-xs">
              {result.command} · {result.durationMs}ms · {result.rowCount} row
              {result.rowCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {runMutation.isPending ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-sm">
              <div className="size-5 animate-spin rounded-full border border-primary border-t-transparent" />
              Running query...
            </div>
          ) : result ? (
            <QueryResultTable result={result} />
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <p className="font-medium text-sm">No results to display</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Write and run a query above to see results here.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

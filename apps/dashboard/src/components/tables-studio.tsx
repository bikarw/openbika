import type {
  BranchQueryResponse,
  BranchSchemaResponse,
  BranchSchemaTableResponse,
} from "@openbika/contracts";
import { Badge } from "@openbika/ui/components/badge";
import { Button } from "@openbika/ui/components/button";
import { Input } from "@openbika/ui/components/input";
import { Skeleton } from "@openbika/ui/components/skeleton";
import { cn } from "@openbika/ui/lib/utils";
import {
  Check,
  Database,
  Filter,
  KeyRound,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  TablePreviewSkeleton,
  TablesSidebarSkeleton,
} from "#/components/loading-placeholders";
import {
  dashboardKeys,
  executeBranchSql,
  fetchBranchSchema,
} from "#/lib/dashboard-api-queries";

interface TablesStudioProps {
  branchId: string;
  branchName: string;
  databaseName: string;
}

interface CellDraft {
  column: string;
  rowIndex: number;
  value: string;
}

interface TableFilter {
  column: string;
  value: string;
}

function tableKey(table: BranchSchemaTableResponse) {
  return `${table.schema}.${table.name}`;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function previewSql(table: BranchSchemaTableResponse, filter: TableFilter) {
  const filterValue = filter.value.trim();
  const filterColumn = table.columns.some(
    (column) => column.name === filter.column,
  )
    ? filter.column
    : (table.columns[0]?.name ?? "");
  const whereClause =
    filterValue && filterColumn
      ? ` where ${quoteIdentifier(filterColumn)}::text ilike ${quoteLiteral(
          `%${filterValue}%`,
        )}`
      : "";

  return `select * from ${quoteIdentifier(table.schema)}.${quoteIdentifier(
    table.name,
  )}${whereClause} limit 100;`;
}

function quoteLiteral(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseDraftValue(value: string, originalValue: unknown) {
  if (value.toLowerCase() === "null") {
    return null;
  }

  if (typeof originalValue === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (typeof originalValue === "boolean") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }

  return value;
}

function renderCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function cellDraftKey(rowIndex: number, column: string) {
  return `${rowIndex}:${column}`;
}

function selectedRowKey(rowIndex: number) {
  return String(rowIndex);
}

function groupTablesBySchema(tables: BranchSchemaTableResponse[]) {
  const grouped = new Map<string, BranchSchemaTableResponse[]>();

  for (const table of tables) {
    grouped.set(table.schema, [...(grouped.get(table.schema) ?? []), table]);
  }

  return grouped;
}

function buildUpdateSql({
  draft,
  primaryKeyColumns,
  row,
  table,
}: {
  draft: CellDraft;
  primaryKeyColumns: string[];
  row: Record<string, unknown>;
  table: BranchSchemaTableResponse;
}) {
  const originalValue = row[draft.column];
  const value = parseDraftValue(draft.value, originalValue);
  const whereClause = primaryKeyColumns
    .map(
      (column) => `${quoteIdentifier(column)} = ${quoteLiteral(row[column])}`,
    )
    .join(" and ");

  return `update ${quoteIdentifier(table.schema)}.${quoteIdentifier(
    table.name,
  )} set ${quoteIdentifier(draft.column)} = ${quoteLiteral(value)} where ${whereClause};`;
}

function buildPrimaryKeyWhereClause({
  primaryKeyColumns,
  row,
}: {
  primaryKeyColumns: string[];
  row: Record<string, unknown>;
}) {
  return primaryKeyColumns
    .map(
      (column) => `${quoteIdentifier(column)} = ${quoteLiteral(row[column])}`,
    )
    .join(" and ");
}

function buildDeleteSql({
  primaryKeyColumns,
  rows,
  table,
}: {
  primaryKeyColumns: string[];
  rows: Record<string, unknown>[];
  table: BranchSchemaTableResponse;
}) {
  return rows
    .map(
      (row) =>
        `delete from ${quoteIdentifier(table.schema)}.${quoteIdentifier(
          table.name,
        )} where ${buildPrimaryKeyWhereClause({ primaryKeyColumns, row })};`,
    )
    .join("\n");
}

function parseInsertValue(value: string) {
  if (value.toLowerCase() === "null") {
    return null;
  }

  if (value.toLowerCase() === "true") {
    return true;
  }

  if (value.toLowerCase() === "false") {
    return false;
  }

  const numericValue = Number(value);
  if (value.trim() !== "" && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return value;
}

function buildInsertSql({
  values,
  table,
}: {
  values: Record<string, string>;
  table: BranchSchemaTableResponse;
}) {
  const entries = table.columns
    .map((column) => [column.name, values[column.name]?.trim() ?? ""] as const)
    .filter(([, value]) => value !== "");

  if (entries.length === 0) {
    throw new Error("Enter at least one value before adding a record.");
  }

  const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
  const rowValues = entries
    .map(([, value]) => quoteLiteral(parseInsertValue(value)))
    .join(", ");

  return `insert into ${quoteIdentifier(table.schema)}.${quoteIdentifier(
    table.name,
  )} (${columns}) values (${rowValues});`;
}

export function TablesStudio({
  branchId,
  branchName,
  databaseName,
}: TablesStudioProps) {
  const schemaQuery = useQuery({
    queryKey: dashboardKeys.branchSchema(branchId),
    queryFn: () => fetchBranchSchema(branchId),
  });
  const schema = schemaQuery.data ?? null;
  const schemaLoading = schemaQuery.isPending;
  const schemaError =
    schemaQuery.error instanceof Error
      ? schemaQuery.error.message
      : schemaQuery.isError
        ? "Failed to load branch schema"
        : null;

  const [selectedTableKey, setSelectedTableKey] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [preview, setPreview] = React.useState<BranchQueryResponse | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<CellDraft[]>([]);
  const [savingDrafts, setSavingDrafts] = React.useState(false);
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const [tableFilter, setTableFilter] = React.useState<TableFilter>({
    column: "",
    value: "",
  });
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [deletingRows, setDeletingRows] = React.useState(false);
  const [addRecordOpen, setAddRecordOpen] = React.useState(false);

  const tables = schema?.tables ?? [];
  const filteredTables = tables.filter((table) =>
    tableKey(table).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const tablesBySchema = groupTablesBySchema(filteredTables);
  const selectedTable =
    tables.find((table) => tableKey(table) === selectedTableKey) ??
    tables[0] ??
    null;
  const primaryKeyColumns =
    selectedTable?.columns
      .filter((column) => column.isPrimaryKey)
      .map((column) => column.name) ?? [];
  const canEditSelectedTable = primaryKeyColumns.length > 0;
  const draftByCell = new Map(
    drafts.map((draft) => [cellDraftKey(draft.rowIndex, draft.column), draft]),
  );
  const selectedColumnByName = new Map(
    selectedTable?.columns.map((column) => [column.name, column]) ?? [],
  );
  const selectedRows =
    preview?.rows.filter((_, rowIndex) =>
      selectedRowKeys.has(selectedRowKey(rowIndex)),
    ) ?? [];
  const allVisibleRowsSelected =
    Boolean(preview?.rows.length) &&
    preview?.rows.every((_, rowIndex) =>
      selectedRowKeys.has(selectedRowKey(rowIndex)),
    );

  React.useEffect(() => {
    const nextSchema = schemaQuery.data;
    if (!nextSchema) return;
    setPreview(null);
    setDrafts([]);
    setSelectedRowKeys(new Set());
    setTableFilter({
      column: nextSchema.tables[0]?.columns[0]?.name ?? "",
      value: "",
    });
    setSelectedTableKey(
      nextSchema.tables[0] ? tableKey(nextSchema.tables[0]) : "",
    );
  }, [schemaQuery.data]);

  async function loadPreview(
    table: BranchSchemaTableResponse,
    filter = tableFilter,
  ) {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setDrafts([]);
    setDraftError(null);
    setSelectedRowKeys(new Set());

    try {
      const result = await executeBranchSql(branchId, {
        readOnly: true,
        sql: previewSql(table, filter),
      });
      setPreview(result);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Failed to load preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  React.useEffect(() => {
    if (!selectedTable) return;
    void loadPreview(selectedTable);
  }, [branchId, selectedTable]);

  function queueDraft({
    column,
    rowIndex,
    value,
  }: {
    column: string;
    rowIndex: number;
    value: string;
  }) {
    const originalValue = preview?.rows[rowIndex]?.[column];
    const originalRendered = renderCellValue(originalValue);

    setDraftError(null);
    setDrafts((current) => {
      const key = cellDraftKey(rowIndex, column);
      const withoutCurrent = current.filter(
        (draft) => cellDraftKey(draft.rowIndex, draft.column) !== key,
      );

      if (value === originalRendered) {
        return withoutCurrent;
      }

      return [...withoutCurrent, { column, rowIndex, value }];
    });
  }

  function selectTable(table: BranchSchemaTableResponse) {
    setSelectedTableKey(tableKey(table));
    setTableFilter({
      column: table.columns[0]?.name ?? "",
      value: "",
    });
    setSelectedRowKeys(new Set());
  }

  function toggleRow(rowIndex: number, checked: boolean) {
    const key = selectedRowKey(rowIndex);
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function toggleAllRows(checked: boolean) {
    setSelectedRowKeys(() => {
      if (!checked || !preview) {
        return new Set();
      }

      return new Set(
        preview.rows.map((_, rowIndex) => selectedRowKey(rowIndex)),
      );
    });
  }

  async function deleteSelectedRows() {
    if (!selectedTable || selectedRows.length === 0) return;

    if (!canEditSelectedTable) {
      setDraftError(
        "Deleting rows requires a primary key on the selected table.",
      );
      return;
    }

    if (drafts.length > 0) {
      setDraftError("Save or discard unsaved edits before deleting rows.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedRows.length} selected row${
        selectedRows.length === 1 ? "" : "s"
      } from ${selectedTable.name}?`,
    );
    if (!confirmed) return;

    setDeletingRows(true);
    setDraftError(null);

    try {
      await executeBranchSql(branchId, {
        readOnly: false,
        sql: buildDeleteSql({
          primaryKeyColumns,
          rows: selectedRows,
          table: selectedTable,
        }),
      });
      await loadPreview(selectedTable);
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "Failed to delete selected rows",
      );
    } finally {
      setDeletingRows(false);
    }
  }

  function applyFilter() {
    if (!selectedTable) return;
    void loadPreview(selectedTable, tableFilter);
  }

  function clearFilter() {
    if (!selectedTable) return;

    const nextFilter = {
      column: selectedTable.columns[0]?.name ?? "",
      value: "",
    };
    setTableFilter(nextFilter);
    void loadPreview(selectedTable, nextFilter);
  }

  async function saveDrafts() {
    if (!selectedTable || !preview || drafts.length === 0) return;

    if (!canEditSelectedTable) {
      setDraftError(
        "Inline editing requires a primary key on the selected table.",
      );
      return;
    }

    setSavingDrafts(true);
    setDraftError(null);

    try {
      const sql = drafts
        .map((draft) => {
          const row = preview.rows[draft.rowIndex];
          if (!row) {
            throw new Error("A changed row is no longer available.");
          }

          return buildUpdateSql({
            draft,
            primaryKeyColumns,
            row,
            table: selectedTable,
          });
        })
        .join("\n");
      await executeBranchSql(branchId, {
        readOnly: false,
        sql,
      });
      await loadPreview(selectedTable);
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    } finally {
      setSavingDrafts(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 flex-1 gap-1 overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="shrink-0 space-y-3 border-border border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-sm">
                <Database className="size-4" />
                Tables
              </h2>
              <p className="text-muted-foreground text-xs">
                {branchName} · {databaseName}
              </p>
            </div>
            {schemaLoading ? (
              <Skeleton aria-hidden className="h-5 w-9 rounded-full" />
            ) : (
              <Badge variant="outline">{tables.length}</Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tables"
              value={search}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {schemaLoading ? <TablesSidebarSkeleton /> : null}
          {schemaError ? (
            <p className="text-destructive text-sm" role="alert">
              {schemaError}
            </p>
          ) : null}
          {!schemaLoading && filteredTables.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tables found on this branch.
            </p>
          ) : null}
          {[...tablesBySchema.entries()].map(([schemaName, schemaTables]) => (
            <div className="mb-3" key={schemaName}>
              <div className="mb-1 flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-xs">
                <Layers3 className="size-3.5" />
                <span className="truncate font-medium">{schemaName}</span>
              </div>
              <div className="space-y-1">
                {schemaTables.map((table) => {
                  const active =
                    selectedTable &&
                    tableKey(table) === tableKey(selectedTable);

                  return (
                    <button
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-border bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      key={tableKey(table)}
                      onClick={() => selectTable(table)}
                      type="button"
                    >
                      <Table2
                        className={cn(
                          "size-4 shrink-0 opacity-60",
                          active && "text-primary opacity-100",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {table.name}
                      </span>
                      {table.columns.some((column) => column.isPrimaryKey) ? (
                        <KeyRound className="size-3.5 text-muted-foreground opacity-60" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
        {selectedTable ? (
          <>
            <div className="flex h-9 shrink-0 items-center gap-1 border-border border-b bg-muted/50 px-1">
              <button
                className="flex h-7 max-w-64 items-center gap-1 rounded-md border border-primary/40 bg-background px-2 text-sm shadow-xs"
                type="button"
              >
                <Table2 className="size-3.5 text-primary" />
                <span className="truncate">
                  <span className="text-muted-foreground">
                    {selectedTable.schema}.
                  </span>
                  {selectedTable.name}
                </span>
              </button>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-border border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-sm">
                  <span className="text-muted-foreground">
                    {selectedTable.schema}.
                  </span>
                  {selectedTable.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <span>{selectedTable.columns.length} columns</span>
                  <span>·</span>
                  <span>{selectedTable.type}</span>
                  {selectedTable.estimatedRows !== null ? (
                    <>
                      <span>·</span>
                      <span>~{selectedTable.estimatedRows} rows</span>
                    </>
                  ) : null}
                  {canEditSelectedTable ? (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-primary">
                        <KeyRound className="size-3" />
                        Inline editing enabled
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {drafts.length > 0 ? (
                  <Badge className="gap-1.5" variant="outline">
                    <Check className="size-3" />
                    {drafts.length} unsaved
                  </Badge>
                ) : null}
                {selectedRows.length > 0 ? (
                  <Badge className="gap-1.5" variant="outline">
                    <Check className="size-3" />
                    {selectedRows.length} selected
                  </Badge>
                ) : null}
                <Button
                  onClick={() => setAddRecordOpen(true)}
                  size="sm"
                  type="button"
                >
                  <Plus className="size-4" />
                  Add record
                </Button>
                {selectedRows.length > 0 ? (
                  <Button
                    disabled={deletingRows}
                    onClick={() => void deleteSelectedRows()}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="size-4" />
                    {deletingRows
                      ? "Deleting..."
                      : `Delete ${selectedRows.length} Record${
                          selectedRows.length === 1 ? "" : "s"
                        }`}
                  </Button>
                ) : null}
                <Button
                  disabled={previewLoading}
                  onClick={() => void loadPreview(selectedTable)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="size-4" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-border border-b bg-muted/20 px-4 py-3 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <Filter className="size-3.5" />
                Filter
              </div>
              <select
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                onChange={(event) =>
                  setTableFilter((current) => ({
                    ...current,
                    column: event.target.value,
                  }))
                }
                value={tableFilter.column}
              >
                {selectedTable.columns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
              <Input
                className="max-w-md"
                onChange={(event) =>
                  setTableFilter((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyFilter();
                  }
                }}
                placeholder="Contains..."
                value={tableFilter.value}
              />
              <div className="flex items-center gap-2">
                <Button
                  disabled={previewLoading}
                  onClick={applyFilter}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Apply
                </Button>
                <Button
                  disabled={previewLoading || tableFilter.value.trim() === ""}
                  onClick={clearFilter}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-4" />
                  Clear
                </Button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-0 overflow-auto pb-16">
                {previewLoading ? <TablePreviewSkeleton /> : null}
                {previewError ? (
                  <p className="p-4 text-destructive text-sm" role="alert">
                    {previewError}
                  </p>
                ) : null}
                {draftError ? (
                  <p className="p-4 text-destructive text-sm" role="alert">
                    {draftError}
                  </p>
                ) : null}
                {preview ? (
                  <table className="w-max min-w-full border-separate border-spacing-0 caption-bottom text-sm">
                    <thead className="sticky top-0 z-20 bg-background shadow-sm [&_tr]:border-b">
                      <tr className="border-border border-b transition-colors hover:bg-muted/50">
                        <th className="sticky left-0 z-30 h-9 w-12 border-border border-r bg-background px-3 text-center align-middle font-medium text-muted-foreground text-xs">
                          <input
                            aria-label="Select all visible rows"
                            checked={allVisibleRowsSelected}
                            className="size-4 rounded border-border accent-primary"
                            onChange={(event) =>
                              toggleAllRows(event.target.checked)
                            }
                            type="checkbox"
                          />
                        </th>
                        {preview.columns.map((column) => {
                          const schemaColumn = selectedColumnByName.get(
                            column.name,
                          );

                          return (
                            <th
                              className="whitespace-nowrap border-border border-r bg-background px-3 py-2 text-left align-middle font-medium text-muted-foreground text-xs"
                              key={column.name}
                            >
                              <span className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1.5 text-foreground">
                                  {primaryKeyColumns.includes(column.name) ? (
                                    <KeyRound className="size-3 text-primary" />
                                  ) : null}
                                  {column.name}
                                </span>
                                {schemaColumn ? (
                                  <span className="font-mono font-normal text-[10px] text-muted-foreground uppercase tracking-wide">
                                    {schemaColumn.dataType}
                                  </span>
                                ) : null}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {preview.rows.map((row, rowIndex) => (
                        <tr
                          className="border-border border-b transition-colors hover:bg-accent/30"
                          key={rowIndex}
                        >
                          <td className="sticky left-0 z-10 border-border border-r bg-background px-3 py-3 text-center align-middle">
                            <input
                              aria-label={`Select row ${rowIndex + 1}`}
                              checked={selectedRowKeys.has(
                                selectedRowKey(rowIndex),
                              )}
                              className="size-4 rounded border-border accent-primary"
                              onChange={(event) =>
                                toggleRow(rowIndex, event.target.checked)
                              }
                              type="checkbox"
                            />
                          </td>
                          {preview.columns.map((column) => {
                            const draft = draftByCell.get(
                              cellDraftKey(rowIndex, column.name),
                            );
                            const isPrimaryKey = primaryKeyColumns.includes(
                              column.name,
                            );

                            return (
                              <td
                                className={cn(
                                  "min-w-44 border-border border-r p-0 align-middle",
                                  draft && "bg-primary/5",
                                )}
                                key={column.name}
                              >
                                <input
                                  aria-label={`Edit ${column.name} for row ${rowIndex + 1}`}
                                  className={cn(
                                    "h-9 w-full cursor-cell bg-transparent px-3 font-mono text-xs outline-none transition-colors hover:bg-muted/40 focus:bg-muted/70 focus:ring-2 focus:ring-ring/30",
                                    isPrimaryKey &&
                                      "cursor-not-allowed text-muted-foreground",
                                  )}
                                  disabled={
                                    !canEditSelectedTable || isPrimaryKey
                                  }
                                  onChange={(event) =>
                                    queueDraft({
                                      column: column.name,
                                      rowIndex,
                                      value: event.target.value,
                                    })
                                  }
                                  title={
                                    canEditSelectedTable
                                      ? "Edit value"
                                      : "Inline editing requires a primary key"
                                  }
                                  value={
                                    draft?.value ??
                                    renderCellValue(row[column.name])
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
              {drafts.length > 0 ? (
                <div className="pointer-events-auto absolute right-4 bottom-4 left-4 z-30 mx-auto flex w-fit items-center gap-2 rounded-lg border border-border bg-card/90 py-1.5 pr-1.5 pl-3 text-card-foreground shadow-lg backdrop-blur-md">
                  <span className="text-xs">
                    <span className="font-medium">{drafts.length}</span> unsaved
                    change{drafts.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    disabled={savingDrafts}
                    onClick={() => setDrafts([])}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <X className="size-3.5" />
                    Discard
                  </Button>
                  <Button
                    disabled={savingDrafts}
                    onClick={() => void saveDrafts()}
                    size="xs"
                    type="button"
                  >
                    <Save className="size-3.5" />
                    {savingDrafts ? "Saving..." : "Save"}
                  </Button>
                </div>
              ) : null}
            </div>
            {addRecordOpen ? (
              <AddRecordModal
                branchId={branchId}
                onClose={() => setAddRecordOpen(false)}
                onRecordAdded={() => void loadPreview(selectedTable)}
                table={selectedTable}
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <div className="max-w-md text-center">
              <p className="font-medium">No table selected</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Select a table to inspect its columns and preview data.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AddRecordModal({
  branchId,
  onClose,
  onRecordAdded,
  table,
}: {
  branchId: string;
  onClose: () => void;
  onRecordAdded: () => void;
  table: BranchSchemaTableResponse;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await executeBranchSql(branchId, {
        readOnly: false,
        sql: buildInsertSql({ table, values }),
      });
      onClose();
      onRecordAdded();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to add record",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    if (submitting) return;
    onClose();
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 text-left backdrop-blur-sm"
      role="dialog"
    >
      <form
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex items-start justify-between gap-4 border-border border-b p-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-lg tracking-tight">Add record</h2>
            <p className="truncate text-muted-foreground text-sm">
              Insert a row into {table.schema}.{table.name}. Blank fields use
              database defaults.
            </p>
          </div>
          <Button
            aria-label="Close add record modal"
            disabled={submitting}
            onClick={closeModal}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {table.columns.map((column, index) => (
              <label className="space-y-1.5" key={column.name}>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {column.isPrimaryKey ? (
                    <KeyRound className="size-3 text-primary" />
                  ) : null}
                  {column.name}
                </span>
                <Input
                  autoFocus={index === 0}
                  disabled={submitting}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [column.name]: event.target.value,
                    }))
                  }
                  placeholder={
                    column.defaultValue
                      ? `Default: ${column.defaultValue}`
                      : column.isNullable
                        ? "Nullable"
                        : column.dataType
                  }
                  value={values[column.name] ?? ""}
                />
                <span className="block truncate text-muted-foreground text-xs">
                  {column.dataType}
                  {column.isNullable ? " · nullable" : ""}
                </span>
              </label>
            ))}
          </div>

          {errorMessage ? (
            <p className="mt-4 text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-border border-t p-4">
          <Button
            disabled={submitting}
            onClick={closeModal}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={submitting} type="submit">
            <Plus className="size-4" />
            {submitting ? "Adding..." : "Add record"}
          </Button>
        </div>
      </form>
    </div>
  );
}

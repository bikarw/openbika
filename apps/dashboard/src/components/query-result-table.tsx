import type { BranchQueryResponse } from "@openbika/contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openbika/ui/components/table";

function renderValue(value: unknown) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function QueryResultTable({ result }: { result: BranchQueryResponse }) {
  if (result.columns.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">{result.command}</p>
        <p className="text-muted-foreground">
          Query completed in {result.durationMs}ms.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {result.columns.map((column) => (
              <TableHead className="whitespace-nowrap" key={column.name}>
                {column.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row, index) => (
            <TableRow key={index}>
              {result.columns.map((column) => (
                <TableCell
                  className="max-w-72 truncate font-mono text-xs"
                  key={column.name}
                  title={String(row[column.name] ?? "")}
                >
                  {renderValue(row[column.name])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {result.truncated ? (
        <p className="border-border border-t px-3 py-2 text-muted-foreground text-xs">
          Showing the first {result.rows.length} rows.
        </p>
      ) : null}
    </div>
  );
}

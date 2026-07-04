import type { Table } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';

/** SQL column names of a table — used by the gateway privacy test suite. */
export function columnNamesOf(table: Table): string[] {
  return Object.values(getTableColumns(table)).map((column) => column.name);
}

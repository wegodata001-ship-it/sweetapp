/**
 * Inventory location columns live in prisma migrations:
 * 20260811120000_location_and_placement_display_order
 * 20260826120000_weekday_minimums
 * They were verified present on the live database, so screen requests
 * do not probe information_schema and do not run ALTER or CREATE.
 * If a column is missing, callers still fall back through isMissingColumnError.
 */
export async function ensureLocationSchemaColumns(): Promise<void> {
  return;
}

export function isMissingColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /displayOrder|minimumQuantity/i.test(msg) &&
    (/does not exist|Unknown column|column .+ does not exist|no such column/i.test(msg) ||
      msg.includes("P2022"))
  );
}

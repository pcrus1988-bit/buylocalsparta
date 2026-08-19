import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export async function saveRegisteredCustomerName(input: { userId: string; fullName: string; now: number }): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const normalized = input.fullName.trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ");
  if (parts.length < 2) throw new Error("Συμπλήρωσε όνομα και επώνυμο.");
  if (normalized.length > 160) throw new Error("Το ονοματεπώνυμο είναι πολύ μεγάλο.");
  const firstName = parts.slice(0, -1).join(" ");
  const lastName = parts.at(-1)!;
  const runtime = getProductionPostgresRuntime();
  const user = await runtime.sqlPool.query("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [input.userId]);
  if (!user.rowCount) throw new Error("Customer account not found");
  const userUuid = String(user.rows[0].id);
  await runtime.sqlPool.query(`
    INSERT INTO customer_profiles(user_id,first_name,last_name,created_at,updated_at)
    VALUES($1,$2,$3,$4,$4)
    ON CONFLICT(user_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,updated_at=EXCLUDED.updated_at
  `, [userUuid, firstName, lastName, new Date(input.now)]);
}

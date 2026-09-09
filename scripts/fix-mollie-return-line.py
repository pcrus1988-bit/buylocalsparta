from pathlib import Path

path = Path("packages/postgres-runtime/src/mollie-payments.ts")
src = path.read_text()
old_query = "rl.id::text AS return_line_uuid,rl.order_line_id::text AS line_uuid"
new_query = "rl.order_line_id::text AS line_uuid"
if old_query not in src:
    raise SystemExit("Expected invalid return_lines.id query was not found")
src = src.replace(old_query, new_query, 1)
old_update = 'await tx.query(`UPDATE return_lines SET refund_id=$2 WHERE id=$1`, [text(row.return_line_uuid, "return_line_uuid"), refundUuid]);'
new_update = 'await tx.query(`UPDATE return_lines SET refund_id=$3 WHERE return_id=$1 AND order_line_id=$2`, [text(row.return_uuid, "return_uuid"), text(row.line_uuid, "line_uuid"), refundUuid]);'
if old_update not in src:
    raise SystemExit("Expected invalid return_lines update was not found")
src = src.replace(old_update, new_update, 1)
path.write_text(src)

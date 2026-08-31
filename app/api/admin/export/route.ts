import { getAdminUser } from "@/lib/admin-auth";
import { listRecords } from "@/lib/data-store";
import { adminSectionAllowed } from "@/lib/admin-sections";

function cell(value: unknown) { const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return `"${text.replace(/"/g, '""')}"`; }

export async function GET() {
  const user = await getAdminUser();
  if (!user) return new Response("Nepřihlášeno", { status: 401 });
  if (!adminSectionAllowed("service_requests", user.role)) return new Response("Export není pro vaši roli dostupný.", { status: 403 });
  if (!user.cityId && user.role !== "super_admin") return new Response("CSV export není v rozsahu editorovy role.", { status: 403 });
  const rows = (await listRecords("service_requests")).filter((row) => user.role === "super_admin" || row.city_id === user.cityId);
  const headers = ["id", "created_at", "name", "email", "phone", "service_type", "description", "preferred_date", "status"];
  const csv = `\uFEFF${headers.join(",")}\r\n${rows.map((row) => headers.map((header) => cell(row[header])).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=studenthub-poptavky.csv", "cache-control": "no-store" } });
}

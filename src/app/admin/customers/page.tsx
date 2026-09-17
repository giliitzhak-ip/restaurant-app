import type { Metadata } from "next";
import { t } from "@/i18n";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";

export const metadata: Metadata = {
  title: t.admin.customers,
  robots: { index: false, follow: false },
};

export default async function AdminCustomersPage() {
  const repository = getRepository();
  const [users, orders] = await Promise.all([
    repository.listUsers(),
    repository.listOrders(),
  ]);

  const ordersByUser = new Map<string, number>();
  for (const order of orders) {
    if (!order.userId) continue;
    ordersByUser.set(order.userId, (ordersByUser.get(order.userId) ?? 0) + 1);
  }

  return (
    <div>
      <AdminPageHeader title={t.admin.customers} description={`${users.length} חשבונות`} />
      <AdminTable head={["שם", "אימייל", "טלפון", "הרשאה", "הזמנות", "נרשם"]}>
        {users.map((user) => (
          <tr key={user.id}>
            <AdminCell>{user.fullName}</AdminCell>
            <AdminCell className="text-muted">{user.email}</AdminCell>
            <AdminCell className="num text-muted">{user.phone ?? "—"}</AdminCell>
            <AdminCell>
              <Badge variant={user.role === "ADMIN" ? "ink" : "neutral"}>
                {user.role}
              </Badge>
            </AdminCell>
            <AdminCell className="num">{ordersByUser.get(user.id) ?? 0}</AdminCell>
            <AdminCell className="num text-muted">{formatDate(user.createdAt)}</AdminCell>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}

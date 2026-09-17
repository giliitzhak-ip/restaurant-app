import type { Metadata } from "next";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { AdminPageHeader } from "@/features/admin/admin-table";
import { CouponEditor } from "@/features/admin/coupon-editor";

export const metadata: Metadata = {
  title: t.admin.coupons,
  robots: { index: false, follow: false },
};

export default async function AdminCouponsPage() {
  const coupons = await getRepository().listCoupons();
  return (
    <div>
      <AdminPageHeader title={t.admin.coupons} />
      <CouponEditor coupons={coupons} />
    </div>
  );
}

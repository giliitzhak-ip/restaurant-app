import type { Metadata } from 'next';
import { CustomerJobDetail } from '@/features/jobs/components/customer-job-detail';

export const metadata: Metadata = { title: 'פרטי עבודה' };

export default async function CustomerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerJobDetail jobId={id} />;
}

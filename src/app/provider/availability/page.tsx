import { AvailabilityEditor } from './availability-editor';

export const metadata = { title: 'שעות עבודה — GET SERVICE' };

export default function ProviderAvailabilityPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-5">
      <AvailabilityEditor />
    </main>
  );
}

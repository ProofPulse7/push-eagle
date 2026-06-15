import { redirect } from 'next/navigation';

export default function LegacyAnalyticsPage() {
  redirect('/settings/analytics');
}

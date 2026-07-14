// app/page.tsx
import dynamicLoader from 'next/dynamic';

export const dynamic = 'force-dynamic';

const ClientDashboard = dynamicLoader(() => import('./dashboard/ClientDashboard'), {
  ssr: false,
});

export default function Page() {
  return <ClientDashboard />;
}
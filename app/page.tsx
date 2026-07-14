// app/page.tsx
import dynamic from 'next/dynamic';

const ClientDashboard = dynamic(() => import('./dashboard/ClientDashboard'), {
  ssr: false,
});

export default function Page() {
  return <ClientDashboard />;
}
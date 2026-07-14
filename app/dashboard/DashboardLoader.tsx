"use client";

import dynamic from 'next/dynamic';

const ClientDashboard = dynamic(() => import('./ClientDashboard'), {
  ssr: false,
});

export default function DashboardLoader() {
  return <ClientDashboard />;
}
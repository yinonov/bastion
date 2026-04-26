import { AlertTriangle, ShieldCheck } from "lucide-react";
import { LiveDashboard } from "@/components/live-dashboard";
import { getDashboardData } from "@/lib/api";

export default async function Home() {
  const data = await getDashboardData();

  if (data.status === "unavailable") {
    return (
      <main className="min-h-screen bg-ink text-text">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-5 py-10 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-line pb-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cyan">
              <ShieldCheck className="h-4 w-4" />
              Bastion Control Plane
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-text md:text-5xl">Risk Command Center</h1>
          </header>

          <div className="rounded-lg border border-red/40 bg-red/10 p-5">
            <div className="mb-2 flex items-center gap-2 text-red">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-base font-medium">Live dashboard data unavailable</span>
            </div>
            <p className="text-sm text-muted">{data.message}</p>
            <p className="mt-3 text-sm text-muted">Start or check the local edge server and refresh this page to load live telemetry.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <LiveDashboard
      initialSummary={data.snapshot.summary}
      initialEvents={data.snapshot.events}
      initialFindings={data.snapshot.findings}
    />
  );
}

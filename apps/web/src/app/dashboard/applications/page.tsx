import { ApplicationsPanel } from '@/components/applications/ApplicationsPanel';

export default function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Watch AI apply in real time and take over when human action is required.
        </p>
      </div>
      <ApplicationsPanel />
    </div>
  );
}

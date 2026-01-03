import { getPlanFromUrl, type UrlEncodedPlan } from '@peer-plan/schema';
import { PlanHeader } from './components/PlanHeader';
import { PlanViewer } from './components/PlanViewer';
import { SyncStatus } from './components/SyncStatus';
import { useHydration } from './hooks/useHydration';
import { useYjsSync } from './hooks/useYjsSync';

function NoPlanError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">No Plan Found</h1>
        <p className="text-gray-600">The URL doesn't contain valid plan data. Add ?d= parameter.</p>
      </div>
    </div>
  );
}

interface PlanAppProps {
  urlPlan: UrlEncodedPlan;
}

function PlanApp({ urlPlan }: PlanAppProps) {
  const { ydoc, syncState } = useYjsSync(urlPlan.id);
  useHydration(ydoc, urlPlan);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <SyncStatus {...syncState} />
        <PlanHeader ydoc={ydoc} fallback={urlPlan} />
        <PlanViewer ydoc={ydoc} fallback={urlPlan} />
      </div>
    </div>
  );
}

export function App() {
  const urlPlan = getPlanFromUrl();

  if (!urlPlan) {
    return <NoPlanError />;
  }

  return <PlanApp urlPlan={urlPlan} />;
}

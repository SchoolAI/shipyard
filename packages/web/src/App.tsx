import { getPlanFromUrl } from '@peer-plan/schema';
import { PlanHeader } from './components/PlanHeader';
import { PlanViewer } from './components/PlanViewer';

export function App() {
  const plan = getPlanFromUrl();

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">No Plan Found</h1>
          <p className="text-gray-600">
            The URL doesn't contain valid plan data. Add ?d= parameter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <PlanHeader plan={plan} />
        <PlanViewer plan={plan} />
      </div>
    </div>
  );
}

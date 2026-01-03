import type { Artifact } from '@peer-plan/schema';
import { getPlanFromUrl } from '@peer-plan/schema';

export function App() {
  const plan = getPlanFromUrl();

  if (!plan) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>Peer Plan</h1>
        <p>No plan found in URL. Add ?d= parameter with encoded plan data.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '800px', margin: '0 auto' }}>
      <h1>{plan.title}</h1>
      <p>
        <strong>Status:</strong> <code>{plan.status}</code>
      </p>
      {plan.repo && (
        <p>
          <strong>Repo:</strong> {plan.repo}
          {plan.pr && ` (PR #${plan.pr})`}
        </p>
      )}

      <h2>Content ({plan.content.length} blocks)</h2>
      <div
        style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}
      >
        <pre style={{ margin: 0 }}>{JSON.stringify(plan.content, null, 2)}</pre>
      </div>

      {plan.artifacts && plan.artifacts.length > 0 && (
        <>
          <h2>Artifacts ({plan.artifacts.length})</h2>
          <ul>
            {plan.artifacts.map((artifact: Artifact) => (
              <li key={artifact.id}>
                {artifact.type}: {artifact.filename}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

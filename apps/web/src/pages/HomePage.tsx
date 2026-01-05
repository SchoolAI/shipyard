export function HomePage() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Welcome to Peer-Plan
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Select a plan from the sidebar or create one via MCP.
        </p>
      </div>
    </div>
  );
}

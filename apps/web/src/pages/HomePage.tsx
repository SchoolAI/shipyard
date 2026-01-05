export function HomePage() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to Peer-Plan</h1>
        <p className="text-muted-foreground">
          Select a plan from the sidebar or create one via MCP.
        </p>
      </div>
    </div>
  );
}

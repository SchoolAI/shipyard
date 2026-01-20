export function HomePage() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">Welcome to Shipyard</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Select a plan from the sidebar or create one via MCP.
        </p>
      </div>
    </div>
  );
}

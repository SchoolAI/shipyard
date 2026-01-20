export function HomePage() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="Shipyard" className="w-16 h-16 mx-auto mb-4 opacity-90" />
        <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">Welcome to Shipyard</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Select a task from the sidebar or create one via MCP.
        </p>
      </div>
    </div>
  );
}

# Patterns

Reusable patterns and templates for common development tasks.

## Available Patterns

- **[Cloudflare Worker Setup](./cloudflare-worker-setup.md)** - Complete guide for setting up a new Cloudflare Worker with testing, linting, and type safety
  - Fan-in based coverage
  - Per-package lint scripts (Turborepo caching)
  - Zod schemas + typed client
  - Route constants pattern
  - **Validated on:** apps/signaling (107 tests, 0 errors)

## Adding New Patterns

When you discover a reusable pattern:

1. Create a new markdown file in this directory
2. Include the pattern origin (where it was first used)
3. Document all steps with code examples
4. Add common gotchas section
5. Update this README with a link

**Pattern criteria:**
- Used successfully in production code
- Solves a common problem
- Reduces future setup time
- Includes verification steps

#!/usr/bin/env bash
# Inject documentation into Claude Code context at session start
# Reads config from .claude/inject-docs.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/inject-docs.json"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo "[inject-docs] Error: jq is required but not installed" >&2
    exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "[inject-docs] Error: Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

# Parse config
MAX_LINES=$(jq -r '.maxLinesPerFile // 500' "$CONFIG_FILE")

# Get doc patterns (handles both strings and arrays)
DOC_PATTERNS=$(jq -r '.docs[]' "$CONFIG_FILE" 2>/dev/null || echo "")

# Get exclude patterns
EXCLUDE_PATTERNS=$(jq -r '.exclude[]?' "$CONFIG_FILE" 2>/dev/null || echo "")

# Function to check if a file matches any exclude pattern
is_excluded() {
    local file="$1"
    local rel_path="${file#$PROJECT_ROOT/}"

    while IFS= read -r pattern; do
        [[ -z "$pattern" ]] && continue
        # Convert glob pattern to regex for matching
        if [[ "$rel_path" == $pattern ]]; then
            return 0
        fi
    done <<< "$EXCLUDE_PATTERNS"
    return 1
}

# Collect all files from patterns
FILES=()
cd "$PROJECT_ROOT"

while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue

    # Expand glob pattern
    for file in $pattern; do
        if [[ -f "$file" ]] && ! is_excluded "$PROJECT_ROOT/$file"; then
            FILES+=("$file")
        fi
    done
done <<< "$DOC_PATTERNS"

# Remove duplicates and sort
UNIQUE_FILES=($(printf '%s\n' "${FILES[@]}" | sort -u))

if [[ ${#UNIQUE_FILES[@]} -eq 0 ]]; then
    echo "[inject-docs] No documentation files found to inject" >&2
    exit 0
fi

# Output header
echo "# Injected Documentation Context"
echo ""
echo "The following documentation has been automatically injected (${#UNIQUE_FILES[@]} files):"
echo ""

# Output each file
for file in "${UNIQUE_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "---"
        echo "## $file"
        echo ""

        line_count=$(wc -l < "$file")
        if [[ $line_count -gt $MAX_LINES ]]; then
            head -n "$MAX_LINES" "$file"
            echo ""
            echo "[... truncated at $MAX_LINES lines (total: $line_count) ...]"
        else
            cat "$file"
        fi
        echo ""
    fi
done

echo "---"
echo ""
echo "# Additional Context"
echo ""

# List all docs that were NOT injected
echo "## Other Documentation (not injected, read on-demand)"
echo ""
ALL_DOCS=$(find docs -name "*.md" -type f 2>/dev/null | sort)
OTHER_DOCS=()
for doc in $ALL_DOCS; do
    is_injected=false
    for injected in "${UNIQUE_FILES[@]}"; do
        if [[ "$doc" == "$injected" ]]; then
            is_injected=true
            break
        fi
    done
    if [[ "$is_injected" == false ]]; then
        line_count=$(wc -l < "$doc" | tr -d ' ')
        OTHER_DOCS+=("- $doc ($line_count lines)")
    fi
done

if [[ ${#OTHER_DOCS[@]} -gt 0 ]]; then
    printf '%s\n' "${OTHER_DOCS[@]}"
else
    echo "(none)"
fi
echo ""

# List important project files
echo "## Key Project Files"
echo ""
IMPORTANT_FILES=(
    "CLAUDE.md"
    "package.json"
    "pnpm-workspace.yaml"
    "tsconfig.json"
    "biome.json"
    ".env.example"
    "turbo.json"
)
for file in "${IMPORTANT_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "- $file"
    fi
done
echo ""

# Show top-level directory structure
echo "## Project Structure"
echo ""
echo '```'
# Use find to get top-level items, excluding hidden dirs except .claude
find . -maxdepth 1 -mindepth 1 \( -type d -o -type f \) ! -name ".*" -o -name ".claude" | sort | while read -r item; do
    name=$(basename "$item")
    if [[ -d "$item" ]]; then
        echo "$name/"
    else
        echo "$name"
    fi
done
echo '```'
echo ""

# Show apps and packages subdirectories
echo "### apps/"
echo '```'
if [[ -d "apps" ]]; then
    for dir in apps/*/; do
        [[ -d "$dir" ]] && echo "  $(basename "$dir")/"
    done
fi
echo '```'
echo ""

echo "### packages/"
echo '```'
if [[ -d "packages" ]]; then
    for dir in packages/*/; do
        [[ -d "$dir" ]] && echo "  $(basename "$dir")/"
    done
fi
echo '```'
echo ""

echo "---"
echo "# End of Injected Context"

#!/usr/bin/env bash
# PostToolUse hook on Edit|Write|MultiEdit.
# Fast fail: catches syntax errors + obvious problems right after Claude edits a file.
# Exit 0 = silent pass. Exit 2 = block and feed stderr back to Claude.

set -uo pipefail

# Read the JSON event from stdin and extract the file path
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# No file path → nothing to check
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Skip files outside the project
case "$FILE" in
  "$CLAUDE_PROJECT_DIR"*) ;;
  *) exit 0 ;;
esac

# Route by extension
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx)
    if command -v npx >/dev/null 2>&1 && [ -f "$CLAUDE_PROJECT_DIR/package.json" ]; then
      # Prefer project's eslint if available; else just syntax-check
      if npx --no-install eslint --version >/dev/null 2>&1; then
        OUTPUT=$(npx --no-install eslint --max-warnings=0 "$FILE" 2>&1) || {
          echo "ESLint errors in $FILE:" >&2
          echo "$OUTPUT" >&2
          exit 2
        }
      fi
    fi
    ;;
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      OUTPUT=$(ruff check "$FILE" 2>&1) || {
        echo "Ruff errors in $FILE:" >&2
        echo "$OUTPUT" >&2
        exit 2
      }
    elif command -v python3 >/dev/null 2>&1; then
      OUTPUT=$(python3 -m py_compile "$FILE" 2>&1) || {
        echo "Python syntax error in $FILE:" >&2
        echo "$OUTPUT" >&2
        exit 2
      }
    fi
    ;;
  *.json)
    if command -v jq >/dev/null 2>&1; then
      jq empty "$FILE" 2>/dev/null || {
        echo "Invalid JSON: $FILE" >&2
        exit 2
      }
    fi
    ;;
  *.sh)
    if command -v shellcheck >/dev/null 2>&1; then
      OUTPUT=$(shellcheck -S error "$FILE" 2>&1) || {
        echo "Shellcheck errors in $FILE:" >&2
        echo "$OUTPUT" >&2
        exit 2
      }
    fi
    ;;
esac

exit 0

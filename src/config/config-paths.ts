import { isPlainObject } from "../utils.js";
import { isBlockedObjectKey } from "./prototype-keys.js";

type PathNode = Record<string, unknown>;

export function parseConfigPath(raw: string): {
  ok: boolean;
  path?: string[];
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Invalid path. Use dot notation (e.g. foo.bar).",
    };
  }

  const parts: string[] = [];
  let currentSegment = "";
  let state: "bare" | "bracket_unquoted" | "bracket_single" | "bracket_double" = "bare";

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (state === "bare") {
      if (char === "[") {
        if (currentSegment.trim()) {
          parts.push(currentSegment.trim());
        }
        currentSegment = "";
        if (trimmed[i + 1] === '"') {
          state = "bracket_double";
          i++;
        } else if (trimmed[i + 1] === "'") {
          state = "bracket_single";
          i++;
        } else {
          state = "bracket_unquoted";
        }
      } else if (char === ".") {
        if (currentSegment.trim()) {
          parts.push(currentSegment.trim());
          currentSegment = "";
        } else if (currentSegment.length > 0) {
          // Whitespace-only segment between dots (e.g. "foo. .bar")
          return { ok: false, error: "Invalid path. Use dot notation (e.g. foo.bar)." };
        } else if (parts.length === 0 || trimmed[i - 1] === ".") {
          // Leading dot or consecutive dots (e.g. ".foo" or "foo..bar")
          return { ok: false, error: "Invalid path. Use dot notation (e.g. foo.bar)." };
        }
      } else {
        currentSegment += char;
      }
    } else if (state === "bracket_double") {
      if (char === '"' && trimmed[i + 1] === "]") {
        parts.push(currentSegment);
        currentSegment = "";
        state = "bare";
        i++;
      } else {
        currentSegment += char;
      }
    } else if (state === "bracket_single") {
      if (char === "'" && trimmed[i + 1] === "]") {
        parts.push(currentSegment);
        currentSegment = "";
        state = "bare";
        i++;
      } else {
        currentSegment += char;
      }
    } else if (state === "bracket_unquoted") {
      if (char === "]") {
        parts.push(currentSegment.trim());
        currentSegment = "";
        state = "bare";
      } else {
        currentSegment += char;
      }
    }
  }

  if (state !== "bare") {
    return { ok: false, error: "Invalid path. Unclosed bracket." };
  }

  if (currentSegment.trim()) {
    parts.push(currentSegment.trim());
  } else if (trimmed.endsWith(".") || (currentSegment.length > 0 && parts.length === 0)) {
    return { ok: false, error: "Invalid path. Use dot notation (e.g. foo.bar)." };
  }

  if (parts.length === 0) {
    return {
      ok: false,
      error: "Invalid path. Use dot notation (e.g. foo.bar).",
    };
  }

  if (parts.some((part) => !part)) {
    return {
      ok: false,
      error: "Invalid path. Use dot notation (e.g. foo.bar).",
    };
  }

  if (parts.some((part) => isBlockedObjectKey(part))) {
    return { ok: false, error: "Invalid path segment." };
  }
  return { ok: true, path: parts };
}

export function setConfigValueAtPath(root: PathNode, path: string[], value: unknown): void {
  let cursor: PathNode = root;
  for (let idx = 0; idx < path.length - 1; idx += 1) {
    const key = path[idx];
    const next = cursor[key];
    if (!isPlainObject(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as PathNode;
  }
  cursor[path[path.length - 1]] = value;
}

export function unsetConfigValueAtPath(root: PathNode, path: string[]): boolean {
  const stack: Array<{ node: PathNode; key: string }> = [];
  let cursor: PathNode = root;
  for (let idx = 0; idx < path.length - 1; idx += 1) {
    const key = path[idx];
    const next = cursor[key];
    if (!isPlainObject(next)) {
      return false;
    }
    stack.push({ node: cursor, key });
    cursor = next;
  }
  const leafKey = path[path.length - 1];
  if (!(leafKey in cursor)) {
    return false;
  }
  delete cursor[leafKey];
  for (let idx = stack.length - 1; idx >= 0; idx -= 1) {
    const { node, key } = stack[idx];
    const child = node[key];
    if (isPlainObject(child) && Object.keys(child).length === 0) {
      delete node[key];
    } else {
      break;
    }
  }
  return true;
}

export function getConfigValueAtPath(root: PathNode, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isPlainObject(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

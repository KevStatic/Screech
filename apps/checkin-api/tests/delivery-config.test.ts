import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tomlPath = resolve(here, "../../../netlify.toml");
const pkgPath = resolve(here, "../package.json");

type Section = Record<string, string>;

/** Minimal TOML reader: `[table]` headers and `key = value` lines, comments dropped. */
function parseToml(text: string): { sections: Map<string, Section>; code: string } {
  const sections = new Map<string, Section>();
  const codeLines: string[] = [];
  let current = "";
  sections.set(current, {});
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    codeLines.push(line);
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (header) {
      current = header[1]!.trim();
      if (!sections.has(current)) sections.set(current, {});
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (kv) {
      const value = kv[2]!.trim().replace(/^"(.*)"$/, "$1");
      sections.get(current)![kv[1]!] = value;
    }
  }
  return { sections, code: codeLines.join("\n") };
}

const { sections, code } = parseToml(readFileSync(tomlPath, "utf8"));

describe("netlify.toml", () => {
  it("sets the build command, publish directory and functions directory", () => {
    const build = sections.get("build");
    expect(build?.["command"]).toBe(
      "pnpm --filter @screech/core build && pnpm --filter @screech/web build",
    );
    expect(build?.["publish"]).toBe("apps/web/dist");
    expect(build?.["functions"]).toBe("apps/checkin-api/netlify/functions");
  });

  it("bundles functions with esbuild", () => {
    expect(sections.get("functions")?.["node_bundler"]).toBe("esbuild");
  });

  it("pins NODE_VERSION to 22", () => {
    expect(sections.get("build.environment")?.["NODE_VERSION"]).toBe("22");
  });

  it("configures the [dev] block", () => {
    const dev = sections.get("dev");
    expect(dev?.["framework"]).toBe("#custom");
    expect(dev?.["command"]).toBe("pnpm --filter @screech/web dev");
    expect(dev?.["targetPort"]).toBe("5173");
    expect(dev?.["port"]).toBe("8888");
  });

  it("has no /api redirect", () => {
    expect(code).not.toMatch(/\[\[redirects\]\]/);
    expect(code).not.toMatch(/\/api/);
  });
});

describe("apps/checkin-api/package.json", () => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };

  it("lists the Netlify runtime packages", () => {
    expect(pkg.dependencies).toHaveProperty("@netlify/blobs");
    expect(pkg.dependencies).toHaveProperty("@netlify/functions");
  });

  it("depends on @screech/core through the workspace", () => {
    expect(pkg.dependencies?.["@screech/core"]).toBe("workspace:*");
  });
});

import { defineConfig, loadEnv, transformWithEsbuild, type Plugin } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Serves the embed loader at a fixed, unhashed URL:
 *
 *   /widget.js   — paste `<script async src="https://<this app>/widget.js" data-agent-key="pk_…">`
 *                  on any site the chatbot's allowed origins permit.
 *
 * The source lives in `src/widget-loader.js` and is minified here so dev and
 * production serve the same bytes. `VITE_API_URL` is inlined at build time
 * because the loader runs on other people's sites and cannot read `.env`.
 */
function widgetLoader(env: Record<string, string>): Plugin {
  const source = fileURLToPath(new URL("./src/widget-loader.js", import.meta.url));
  const apiBase = `${(env.VITE_API_URL || "").replace(/\/+$/, "")}/api/v1`;

  async function bundle() {
    let code = await readFile(source, "utf8");
    code = code.replaceAll('"__EMBED_API_BASE__"', JSON.stringify(apiBase));
    const result = await transformWithEsbuild(code, source, {
      minify: true,
      target: "es2015",
      legalComments: "none",
    });
    return result.code;
  }

  return {
    name: "chatbot-widget-loader",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/widget.js") return next();
        bundle().then((code) => {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.end(code);
        }, next);
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "widget.js", source: await bundle() });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackRouter({ autoCodeSplitting: true }),
      react(),
      widgetLoader(env),
    ],
    esbuild: {
      pure: ["console.log", "console.debug", "console.info", "console.trace"],
      drop: ["debugger"],
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    server: {
      host: "::",
      port: Number(process.env.PORT) || 5173,
      watch: { ignored: ["**/routeTree.gen.ts"] },
    },
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";
import { homedir } from "os";

const host = process.env.TAURI_DEV_HOST;

// Serve files from app data directory under /static/ path in dev mode
function resolveAppDataDir() {
  const home = homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library/Application Support/com.meuxe.app");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "com.meuxe.app",
    );
  }
  return path.join(home, ".local/share/com.meuxe.app");
}

function appDataStaticPlugin() {
  const appDataDir = resolveAppDataDir();
  const workspaceRoot = process.cwd();

  const serveFile = (filePath: string, req: any, res: any) => {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".json": "application/json",
      ".moc3": "application/octet-stream",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".mp3": "audio/mpeg",
      ".vrm": "application/octet-stream",
      ".glb": "application/octet-stream",
      ".gltf": "application/json",
      ".fbx": "application/octet-stream",
      ".vrma": "application/octet-stream",
    };
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  };

  return {
    name: "serve-appdata",
    configureServer(server: any) {
      server.middlewares.use("/static", (req: any, res: any, next: any) => {
        const urlPath = (req.url || "").split("?")[0];
        const decoded = decodeURIComponent(urlPath);
        const candidates = [
          path.join(appDataDir, decoded),
          path.join(workspaceRoot, decoded),
          path.join(workspaceRoot, "..", decoded),
        ];

        for (const filePath of candidates) {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            serveFile(filePath, req, res);
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appDataStaticPlugin()],
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/three") ||
            id.includes("@pixiv/three-vrm") ||
            id.includes("@pixiv/three-vrm-animation")
          ) {
            return "three-vrm";
          }
          if (id.includes("node_modules/pixi.js") || id.includes("pixi-live2d-display")) {
            return "live2d-pixi";
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});

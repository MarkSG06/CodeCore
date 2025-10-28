import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import archiver from "archiver";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Ruta base (carpeta /git del usuario)
const PROJECTS_PATH = path.join(process.env.HOMEPATH || process.env.USERPROFILE, "git");
const FAVORITES_FILE = path.join(__dirname, "favorites.json");

// === Funciones auxiliares ===
function loadFavorites() {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      return JSON.parse(fs.readFileSync(FAVORITES_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Error cargando favoritos:", error);
  }
  return [];
}

function saveFavorites(favorites) {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2));
  } catch (error) {
    console.error("Error guardando favoritos:", error);
  }
}

// === Detección de tecnologías ===
function detectTechnologies(projectPath) {
  const technologies = [];
  const packageJsonPath = path.join(projectPath, "package.json");

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      const techMap = {
        react: { name: "React", color: "#61DAFB", icon: "⚛️" },
        next: { name: "Next.js", color: "#000000", icon: "▲" },
        vue: { name: "Vue", color: "#42B883", icon: "🖖" },
        nuxt: { name: "Nuxt", color: "#00DC82", icon: "💚" },
        "@angular/core": { name: "Angular", color: "#DD0031", icon: "🅰️" },
        astro: { name: "Astro", color: "#FF5D01", icon: "🚀" },
        svelte: { name: "Svelte", color: "#FF3E00", icon: "🔥" },
        express: { name: "Express", color: "#000000", icon: "🚂" },
        vite: { name: "Vite", color: "#646CFF", icon: "⚡" },
        typescript: { name: "TypeScript", color: "#3178C6", icon: "📘" },
        tailwindcss: { name: "Tailwind", color: "#06B6D4", icon: "🎨" },
      };

      for (const dep in techMap) {
        if (allDeps[dep]) technologies.push(techMap[dep]);
      }

      if (technologies.length === 0 && allDeps.express) {
        technologies.push({ name: "Node.js", color: "#339933", icon: "📦" });
      }
    } catch (error) {
      console.error("Error leyendo package.json:", error);
    }
  }

  const configFiles = {
    "angular.json": { name: "Angular", color: "#DD0031", icon: "🅰️" },
    "astro.config.mjs": { name: "Astro", color: "#FF5D01", icon: "🚀" },
    "nuxt.config.js": { name: "Nuxt", color: "#00DC82", icon: "💚" },
    "next.config.js": { name: "Next.js", color: "#000000", icon: "▲" },
    "svelte.config.js": { name: "Svelte", color: "#FF3E00", icon: "🔥" },
    "vite.config.js": { name: "Vite", color: "#646CFF", icon: "⚡" },
    "tsconfig.json": { name: "TypeScript", color: "#3178C6", icon: "📘" },
  };

  for (const [file, tech] of Object.entries(configFiles)) {
    if (fs.existsSync(path.join(projectPath, file)) && !technologies.find(t => t.name === tech.name)) {
      technologies.push(tech);
    }
  }

  if (technologies.length === 0) {
    const files = fs.readdirSync(projectPath);
    const hasHTML = files.some(f => f.endsWith(".html"));
    const hasCSS = files.some(f => f.endsWith(".css"));
    const hasJS = files.some(f => f.endsWith(".js"));
    if (hasHTML) technologies.push({ name: "HTML", color: "#E34F26", icon: "📄" });
    if (hasCSS) technologies.push({ name: "CSS", color: "#1572B6", icon: "🎨" });
    if (hasJS) technologies.push({ name: "JavaScript", color: "#F7DF1E", icon: "📜" });
  }

  if (technologies.length === 0) {
    technologies.push({ name: "Static", color: "#6C757D", icon: "📁" });
  }

  return technologies;
}

// === Escanear proyectos ===
function scanProjects(basePath) {
  const dirs = fs.readdirSync(basePath, { withFileTypes: true });
  const projects = [];
  const favorites = loadFavorites();

  dirs.forEach((dir) => {
    if (dir.isDirectory() && dir.name !== ".git") {
      const projectPath = path.join(basePath, dir.name);
      const stats = fs.statSync(projectPath);
      const packageJsonPath = path.join(projectPath, "package.json");
      let dependencies = [];
      let isNode = false;

      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
          dependencies = Object.keys(pkg.dependencies || {});
          isNode = true;
        } catch {}
      }

      const technologies = detectTechnologies(projectPath);

      const exts = new Set();
      const walk = (folder, depth = 0) => {
        if (depth > 3) return;
        try {
          fs.readdirSync(folder, { withFileTypes: true })
            .filter((f) => f.name !== ".git" && f.name !== "node_modules")
            .forEach((f) => {
              const filePath = path.join(folder, f.name);
              if (f.isDirectory()) walk(filePath, depth + 1);
              else {
                const ext = path.extname(f.name).slice(1);
                if (ext) exts.add(ext);
              }
            });
        } catch {}
      };
      walk(projectPath);

      projects.push({
        name: dir.name,
        path: projectPath,
        modified: stats.mtime,
        node: isNode,
        dependencies,
        languages: [...exts],
        technologies,
        favorite: favorites.includes(projectPath),
      });
    }
  });

  return projects;
}

// === Endpoints ===

// 📂 Listar proyectos
app.get("/api/projects", (req, res) => {
  try {
    const data = scanProjects(PROJECTS_PATH);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⭐ Toggle favoritos
app.post("/api/toggle-favorite", (req, res) => {
  try {
    const { path: projectPath } = req.body;
    if (!projectPath) return res.status(400).json({ error: "Path requerido" });

    let favorites = loadFavorites();
    const index = favorites.indexOf(projectPath);
    if (index > -1) favorites.splice(index, 1);
    else favorites.push(projectPath);
    saveFavorites(favorites);

    res.json({ ok: true, favorite: index === -1 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔍 Buscar carpetas en el sistema (versión Node pura)
function searchFolders(baseDir, query, results = [], depth = 0, max = 50) {
  if (results.length >= max || depth > 3) return results;
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
        const folderPath = path.join(baseDir, entry.name);
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(folderPath);
          if (results.length >= max) return results;
        }
        searchFolders(folderPath, query, results, depth + 1, max);
      }
    }
  } catch {}
  return results;
}

app.post("/api/search-folders", (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 2)
      return res.status(400).json({ error: "Query debe tener al menos 2 caracteres" });

    const startPaths =
      process.platform === "win32"
        ? ["C:\\Users", "C:\\Projects", "D:\\"]
        : [process.env.HOME || "/"];

    let results = [];
    for (const base of startPaths) {
      results = results.concat(searchFolders(base, query));
      if (results.length >= 50) break;
    }

    res.json({ results: results.slice(0, 50) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📁 Crear carpeta
app.post("/api/create-folder", (req, res) => {
  try {
    const { name, location } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "El nombre es requerido" });

    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9-_]/g, "-");
    const basePath = location || PROJECTS_PATH;
    const folderPath = path.join(basePath, sanitizedName);

    if (fs.existsSync(folderPath))
      return res.status(400).json({ error: "Ya existe una carpeta con ese nombre" });

    fs.mkdirSync(folderPath, { recursive: true });
    res.json({ ok: true, path: folderPath, name: sanitizedName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔗 Clonar repo
app.post("/api/clone-repo", async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: "URL requerida" });

    const repoName = name || url.split("/").pop().replace(".git", "");
    const sanitizedName = repoName.trim().replace(/[^a-zA-Z0-9-_]/g, "-");
    const targetPath = path.join(PROJECTS_PATH, sanitizedName);
    if (fs.existsSync(targetPath))
      return res.status(400).json({ error: "Ya existe un proyecto con ese nombre" });

    const command = `git clone "${url}" "${targetPath}"`;
    exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error)
        return res.status(500).json({
          error: "Error al clonar repositorio",
          details: stderr || error.message,
        });
      res.json({ ok: true, path: targetPath, name: sanitizedName });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🗜️ Descargar ZIP
app.get("/api/zip", (req, res) => {
  const projectPath = req.query.path;
  if (!projectPath || !fs.existsSync(projectPath))
    return res.status(400).send("Ruta inválida");

  const zipName = path.basename(projectPath) + ".zip";
  res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);
  res.setHeader("Content-Type", "application/zip");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.glob("**/*", {
    cwd: projectPath,
    ignore: ["**/.git/**", "**/node_modules/**"],
  });
  archive.finalize();
});

// 📁 Abrir carpeta local
app.get("/api/open", (req, res) => {
  const projectPath = req.query.path;
  if (!projectPath || !fs.existsSync(projectPath))
    return res.status(400).send("Ruta inválida");

  const platform = process.platform;
  let command =
    platform === "win32"
      ? `start "" "${projectPath}"`
      : platform === "darwin"
      ? `open "${projectPath}"`
      : `xdg-open "${projectPath}"`;

  exec(command, (error) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });
});

// 💻 Abrir con editor
app.get("/api/open-editor", (req, res) => {
  const projectPath = req.query.path;
  const editor = req.query.editor || "vscode";
  if (!projectPath || !fs.existsSync(projectPath))
    return res.status(400).send("Ruta inválida");

  let command =
    editor === "vscode"
      ? `code "${projectPath}"`
      : editor === "cursor"
      ? `cursor "${projectPath}"`
      : null;

  if (!command) return res.status(400).send("Editor no soportado");

  exec(command, (error) => {
    if (error)
      return res.status(500).json({
        error: `No se pudo abrir con ${editor}.`,
        details: error.message,
      });
    res.json({ ok: true, editor, path: projectPath });
  });
});

// 🗑️ Eliminar proyecto
app.delete("/api/delete-project", (req, res) => {
  try {
    const { path: projectPath } = req.body;
    if (!projectPath || !projectPath.trim())
      return res.status(400).json({ error: "Path requerido" });
    if (!fs.existsSync(projectPath))
      return res.status(400).json({ error: "La carpeta no existe" });

    fs.rmSync(projectPath, { recursive: true, force: true });

    let favorites = loadFavorites();
    const index = favorites.indexOf(projectPath);
    if (index > -1) {
      favorites.splice(index, 1);
      saveFavorites(favorites);
    }

    res.json({ ok: true, message: "Proyecto eliminado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🚀 Crear nuevo proyecto
app.post("/api/create-project", (req, res) => {
  const { name, template } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: "El nombre del proyecto es requerido" });

  const sanitizedName = name.trim().replace(/[^a-zA-Z0-9-_]/g, "-");
  const projectPath = path.join(PROJECTS_PATH, sanitizedName);
  if (fs.existsSync(projectPath))
    return res.status(400).json({ error: "Ya existe un proyecto con ese nombre" });

  try {
    fs.mkdirSync(projectPath, { recursive: true });
    switch (template) {
      case "html":
        fs.writeFileSync(
          path.join(projectPath, "index.html"),
          `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizedName}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>¡Hola Mundo!</h1>
  <p>Proyecto: ${sanitizedName}</p>
  <script src="script.js"></script>
</body>
</html>`
        );
        fs.writeFileSync(
          path.join(projectPath, "style.css"),
          `body { font-family: sans-serif; text-align: center; background: #667eea; color: white; }`
        );
        fs.writeFileSync(
          path.join(projectPath, "script.js"),
          `console.log('¡Proyecto ${sanitizedName} iniciado!');`
        );
        break;
      case "node":
        fs.writeFileSync(
          path.join(projectPath, "package.json"),
          JSON.stringify(
            {
              name: sanitizedName,
              version: "1.0.0",
              main: "index.js",
              type: "module",
              scripts: { start: "node index.js" },
            },
            null,
            2
          )
        );
        fs.writeFileSync(path.join(projectPath, "index.js"), `console.log("Hola desde ${sanitizedName}!");`);
        break;
      case "express":
        fs.writeFileSync(
          path.join(projectPath, "package.json"),
          JSON.stringify(
            {
              name: sanitizedName,
              version: "1.0.0",
              main: "server.js",
              type: "module",
              scripts: { start: "node server.js" },
              dependencies: { express: "^4.18.0" },
            },
            null,
            2
          )
        );
        fs.writeFileSync(
          path.join(projectPath, "server.js"),
          `import express from "express";
const app = express();
app.get("/", (req, res) => res.send("Hola desde ${sanitizedName}!"));
app.listen(3000, () => console.log("Servidor en http://localhost:3000"));`
        );
        break;
      default:
        fs.writeFileSync(path.join(projectPath, "README.md"), `# ${sanitizedName}\nProyecto creado con CodeCore.`);
    }

    res.json({ ok: true, name: sanitizedName, path: projectPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
import open from "open"; // 👈 instala esto con: npm install open

const PORT = 8080;
app.listen(PORT, () => {
  console.log("✅ Servidor CodeCore ejecutándose en http://localhost:" + PORT);
  console.log("📁 Monitoreando carpeta:", PROJECTS_PATH);

  // 📂 Ruta absoluta al cliente
  const clientPath = path.join(__dirname, "../client/index.html");

  // 🔗 Abre el index.html del cliente en el navegador predeterminado
  open(clientPath).catch(err => console.error("No se pudo abrir el navegador:", err));
});


// git-push.js
import { spawn } from "child_process";
import readline from "readline";

function runCommand(command, args = [], interactive = true) {
  return new Promise((resolve, reject) => {
    const options = interactive ? { stdio: "inherit", shell: true } : { shell: true };
    const child = spawn(command, args, options);
    let output = "";
    if (!interactive) child.stdout.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(`${command} ${args.join(" ")} falló con código ${code}`))));
  });
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function ensureGitInitialized() {
  try {
    await runCommand("git", ["rev-parse", "--is-inside-work-tree"], false);
  } catch {
    console.log("🆕 No hay repositorio Git aquí. Creándolo...");
    await runCommand("git", ["init"]);
    console.log("✅ Repositorio Git inicializado.");
  }
}

async function ensureOriginExists() {
  const remotes = await runCommand("git", ["remote"], false);
  if (remotes.includes("origin")) return;

  console.log("⚠️  No se encontró un remoto 'origin'.");
  const hasRepo = (await ask("👉 ¿Tienes un repositorio remoto? (y/n): ")).toLowerCase();

  if (hasRepo === "y" || hasRepo === "s") {
    const url = await ask("🔗 Introduce la URL del repositorio remoto: ");
    await runCommand("git", ["remote", "add", "origin", url]);
    console.log(`✅ Remoto 'origin' añadido: ${url}`);
    return;
  }

  console.log("🆕 Vamos a crear un nuevo repositorio remoto en GitHub...");
  const name = (await ask("📛 Nombre del repositorio (deja vacío para usar la carpeta actual): ")) || "";
  const visibility = (await ask("🔒 ¿Repositorio privado? (y/n): ")).toLowerCase() === "y" ? "private" : "public";
  const description = await ask("📝 Descripción (opcional): ");

  const args = ["repo", "create"];
  if (name) args.push(name);
  if (description) args.push("--description", description);
  args.push("--" + visibility, "--source=.", "--remote=origin", "--push");

  console.log("🚀 Creando repositorio en GitHub (requiere `gh` CLI)...");
  await runCommand("gh", args);
  console.log("✅ Repositorio creado y enlazado con 'origin'.");
}

async function main() {
  try {
    await ensureGitInitialized();
    await ensureOriginExists();

    console.log("📦 Subiendo cambios a Git...");
    await runCommand("git", ["pull", "--rebase", "origin", "HEAD"]).catch(() => console.log("ℹ️  Sin cambios previos en remoto."));

    await runCommand("git", ["add", "."]);
    console.log("✅ Archivos añadidos.");

    const message = `Auto commit ${new Date().toLocaleString("es-ES")}`;
    await runCommand("git", ["commit", "-m", `"${message}"`]).catch(() => console.log("⚠️  Nada nuevo que commitear."));

    const branch = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], false);
    console.log(`🌿 Subiendo a rama: ${branch}`);

    await runCommand("git", ["push", "-u", "origin", branch]);
    console.log("🚀 Cambios subidos correctamente ✅");
  } catch (err) {
    console.error("❌ Error subiendo cambios:", err.message);
  }
}

main();

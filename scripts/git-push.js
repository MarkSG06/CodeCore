// git-push.js
import { spawn } from "child_process";

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: true });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} falló con código ${code}`));
    });
  });
}

async function main() {
  try {
    console.log("📦 Subiendo cambios a Git...");

    await runCommand("git", ["add", "."]);
    console.log("✅ Archivos añadidos");

    const message = `Auto commit ${new Date().toLocaleString("es-ES")}`;
    await runCommand("git", ["commit", "-m", `"${message}"`]); // 👈 comillas añadidas

    const branch = await new Promise((resolve, reject) => {
      let output = "";
      const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
      child.stdout.on("data", (data) => (output += data.toString()));
      child.on("close", () => resolve(output.trim()));
      child.on("error", reject);
    });

    console.log(`🌿 Subiendo a rama: ${branch}`);
    await runCommand("git", ["push", "origin", branch]);

    console.log("🚀 Cambios subidos correctamente ✅");
  } catch (err) {
    console.error("❌ Error subiendo cambios:", err.message);
  }
}

main();

import { exec } from "child_process";
import { promisify } from "util";

const run = promisify(exec);

async function main() {
  try {
    console.log("Subiendo cambios a Git...");

    await run("git add .");
    console.log("✅ Archivos añadidos");

    const message = new Date().toLocaleString("es-ES");
    await run(`git commit -m "Auto commit ${message}" || echo '⚠️ Nada que commitear'`);

    await run("git push");
    console.log("Cambios subidos correctamente");
  } catch (err) {
    console.error("❌ Error subiendo cambios:", err.stderr || err.message);
  }
}

main();

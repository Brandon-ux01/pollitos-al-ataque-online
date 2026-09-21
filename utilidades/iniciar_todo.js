/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Iniciar servidor y cliente a la vez
 * =========================================================
 *
 * Arranca en un solo comando:
 *   1. El servidor de juego (Node + Express + Socket.IO) en el puerto 3001.
 *   2. El cliente en modo desarrollo con Vite (puerto 5173).
 *
 * El cliente de Vite se conecta automáticamente al servidor del puerto 3001,
 * así que basta con abrir la dirección que muestra Vite en varios navegadores.
 *
 * Uso:
 *   npm run iniciar
 */

const path = require("node:path");
const { spawn } = require("node:child_process");

const RAIZ = path.join(__dirname, "..");
const VITE = path.join(RAIZ, "node_modules", "vite", "bin", "vite.js");

/** Procesos hijos para poder cerrarlos todos juntos. */
const procesos = [];

/**
 * Arranca un proceso hijo mostrando su salida con un prefijo.
 *
 * @param {string} nombre Etiqueta del proceso.
 * @param {string} archivo Ejecutable o script.
 * @param {string[]} argumentos Argumentos.
 * @param {object} entorno Variables de entorno adicionales.
 */
function arrancar(nombre, archivo, argumentos, entorno = {}) {
    const proceso = spawn(archivo, argumentos, {
        cwd: RAIZ,
        env: { ...process.env, ...entorno },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false
    });

    procesos.push(proceso);

    proceso.stdout.on("data", (datos) => {
        String(datos).trim().split("\n").forEach((linea) => {
            if (linea.trim()) {
                console.log(`[${nombre}] ${linea}`);
            }
        });
    });

    proceso.stderr.on("data", (datos) => {
        String(datos).trim().split("\n").forEach((linea) => {
            if (linea.trim()) {
                console.error(`[${nombre}] ${linea}`);
            }
        });
    });

    proceso.on("exit", (codigo) => {
        console.log(`[${nombre}] terminó con código ${codigo}`);
    });
}

/**
 * Cierra todos los procesos hijos.
 */
function cerrarTodo() {
    procesos.forEach((proceso) => {
        try {
            proceso.kill();
        } catch (error) {
            // El proceso ya estaba cerrado.
        }
    });
}

console.log("=========================================================");
console.log("  POLLITOS AL ATAQUE - INICIANDO TODO");
console.log("=========================================================");
console.log("  Servidor de juego:  http://localhost:3001");
console.log("  Cliente (Vite):     http://localhost:5173");
console.log("  Abre la dirección del cliente en varias pestañas o");
console.log("  navegadores para probar con 2 o hasta 6 jugadores.");
console.log("  Para parar todo: Ctrl + C");
console.log("=========================================================");

// Servidor autoritativo: comparte este puerto con el cliente si se abre 3001.
arrancar("servidor", process.execPath, [path.join(RAIZ, "servidor", "servidor.js")], { PORT: "3001" });

// Cliente en desarrollo (Vite).
arrancar("cliente", process.execPath, [VITE, "dev", "--port", "5173"]);

process.on("SIGINT", () => {
    console.log("\nCerrando servidor y cliente...");
    cerrarTodo();
    process.exit(0);
});

process.on("SIGTERM", () => {
    cerrarTodo();
    process.exit(0);
});

/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Configuración de Vite
 * =========================================================
 *
 * El cliente usa scripts clásicos (sin módulos ES): index.html carga
 * js/*.js por orden. Vite se encarga de empaquetar los estilos y, mediante
 * el plugin de abajo, COPIA tal cual las carpetas estáticas (js, css y
 * assets) dentro de dist/.
 *
 * Resultado: "npm run build" deja un dist/ completo y autónomo, listo para
 * publicar en cualquier hosting estático o para servirlo desde Express.
 *
 * En desarrollo no hace falta nada especial: "npm run dev" sirve el cliente
 * y el cliente se conecta al servidor de Socket.IO (puerto 3001).
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Copia recursivamente una carpeta.
 *
 * @param {string} origen Carpeta de origen.
 * @param {string} destino Carpeta de destino.
 */
function copiarCarpeta(origen, destino) {
    if (!fs.existsSync(origen)) {
        return;
    }

    fs.mkdirSync(destino, { recursive: true });

    fs.readdirSync(origen, { withFileTypes: true }).forEach((entrada) => {
        const rutaOrigen = path.join(origen, entrada.name);
        const rutaDestino = path.join(destino, entrada.name);

        if (entrada.isDirectory()) {
            copiarCarpeta(rutaOrigen, rutaDestino);
            return;
        }

        fs.copyFileSync(rutaOrigen, rutaDestino);
    });
}

/**
 * Plugin que copia los recursos estáticos a dist/ tras cada compilación.
 */
function copiarRecursosEstaticos() {
    return {
        name: "copiar-recursos-estaticos",
        apply: "build",
        closeBundle() {
            const raiz = __dirname;
            const destino = path.join(raiz, "dist");

            ["js", "css", "assets"].forEach((carpeta) => {
                copiarCarpeta(path.join(raiz, carpeta), path.join(destino, carpeta));
            });

            console.log("Recursos copiados a dist/ (js, css, assets)");
        }
    };
}

module.exports = {
    // La raíz del proyecto ya contiene index.html y las carpetas del cliente.
    root: ".",
    publicDir: false,

    server: {
        port: 5173,
        host: true
    },

    build: {
        outDir: "dist",
        emptyOutDir: true,
        assetsDir: "assets"
    },

    plugins: [copiarRecursosEstaticos()]
};

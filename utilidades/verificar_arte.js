/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Verificación del arte del juego
 * =========================================================
 *
 * Comprueba que TODOS los dibujos de assets/imagenes/ que usa el juego existen
 * de verdad, y avisa de los que sobran (dibujos que nadie dibuja).
 *
 * De dónde saca las rutas:
 *  1. Las que aparecen escritas en index.html, css/estilos.css y js/.
 *  2. Las que construye js/recursos.js (los seis estados de los seis pollitos).
 *
 * Uso:  npm run arte
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RAIZ = path.join(__dirname, "..");
const CARPETA_ARTE = path.join(RAIZ, "assets", "imagenes");

/** Archivos donde buscar rutas escritas a mano. */
const ARCHIVOS_REVISADOS = ["index.html", "css/estilos.css"];

/** Recorre una carpeta y devuelve las rutas relativas de sus archivos. */
function listar(carpeta, base = carpeta, encontrados = []) {
    if (!fs.existsSync(carpeta)) {
        return encontrados;
    }

    fs.readdirSync(carpeta, { withFileTypes: true }).forEach((entrada) => {
        const completa = path.join(carpeta, entrada.name);

        if (entrada.isDirectory()) {
            listar(completa, base, encontrados);
            return;
        }

        encontrados.push(path.relative(base, completa).split(path.sep).join("/"));
    });

    return encontrados;
}

/** Rutas escritas a mano dentro de un archivo. */
function rutasEnArchivo(relativa) {
    const completa = path.join(RAIZ, relativa);

    if (!fs.existsSync(completa)) {
        return [];
    }

    const texto = fs.readFileSync(completa, "utf8");
    const expresion = /assets\/imagenes\/[A-Za-z0-9_\-./]+\.png/g;

    return texto.match(expresion) || [];
}

/**
 * Claves de recurso escritas en el código, es decir cadenas con la forma
 * "carpeta/archivo" que usa js/recursos.js (por ejemplo "cancha/pino" se
 * convierte en assets/imagenes/escenarios/cancha/pino.png).
 *
 * Se prueban los prefijos reales del proyecto para no confundir una cadena con
 * una ruta: solo cuenta si el archivo existe.
 */
function clavesDeRecurso(relativa) {
    const completa = path.join(RAIZ, relativa);

    if (!fs.existsSync(completa)) {
        return [];
    }

    const texto = fs.readFileSync(completa, "utf8");
    const cadenas = texto.match(/"[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-/]+"/g) || [];
    const prefijos = ["personajes", "escenarios", "interfaz", "cancha", "botones", "armas", "hud", "resultados"];
    const encontradas = [];

    cadenas.forEach((cadena) => {
        const clave = cadena.slice(1, -1);
        const candidatas = [clave, ...prefijos.map((prefijo) => `${prefijo}/${clave}`)];

        candidatas.forEach((candidata) => {
            const ruta = `assets/imagenes/${candidata}.png`;

            if (fs.existsSync(path.join(RAIZ, ruta))) {
                encontradas.push(ruta);
            }
        });
    });

    return encontradas;
}

/** Rutas de los pollitos, calculadas desde js/recursos.js. */
function rutasDePersonajes() {
    const fuente = fs.readFileSync(path.join(RAIZ, "js", "recursos.js"), "utf8");
    const contexto = {};

    vm.createContext(contexto);
    vm.runInContext(
        fuente + "\nglobalThis.__inventario = { CARPETAS_POLLITO, ARCHIVOS_POLLITO, DIBUJOS_ARMA };",
        contexto
    );

    const { CARPETAS_POLLITO, ARCHIVOS_POLLITO } = contexto.__inventario;
    const rutas = [];

    CARPETAS_POLLITO.forEach((clave) => {
        Object.values(ARCHIVOS_POLLITO).forEach((archivo) => {
            rutas.push(`assets/imagenes/personajes/${clave}/${archivo}.png`);
        });
    });

    return rutas;
}

/**
 * Dibujos que se dejan a propósito sin usar.
 *
 * Los cuatro paneles del HUD traen rótulos en INGLÉS dibujados dentro de la
 * imagen ("NAMES", "STATUS", "TURN", "HEALTH"), así que el HUD se dibuja en el
 * canvas con el mismo estilo pero en español (ver js/interfaz.js).
 */
const IGNORADOS = [
    "assets/imagenes/interfaz/hud/barra_nombres.png",
    "assets/imagenes/interfaz/hud/panel_jugadores.png",
    "assets/imagenes/interfaz/hud/panel_lobby.png",
    "assets/imagenes/interfaz/hud/tarjeta_turno.png"
];

/* --- Comprobación ------------------------------------------------------- */

const referenciadas = new Set();

ARCHIVOS_REVISADOS.forEach((archivo) => {
    rutasEnArchivo(archivo).forEach((ruta) => referenciadas.add(ruta));
});

listar(path.join(RAIZ, "js")).forEach((archivo) => {
    rutasEnArchivo(`js/${archivo}`).forEach((ruta) => referenciadas.add(ruta));
    clavesDeRecurso(`js/${archivo}`).forEach((ruta) => referenciadas.add(ruta));
});

rutasDePersonajes().forEach((ruta) => referenciadas.add(ruta));
IGNORADOS.forEach((ruta) => referenciadas.add(ruta));

const existentes = new Set(listar(CARPETA_ARTE).map((ruta) => `assets/imagenes/${ruta}`));
const faltan = [...referenciadas].filter((ruta) => !existentes.has(ruta) && !IGNORADOS.includes(ruta)).sort();
const sobran = [...existentes].filter((ruta) => !referenciadas.has(ruta)).sort();

console.log("");
console.log("POLLITOS AL ATAQUE - Arte del juego");
console.log(`  Dibujos en assets/imagenes : ${existentes.size}`);
console.log(`  Dibujos usados por el juego: ${referenciadas.size - IGNORADOS.length}`);
console.log(`  Dibujos ignorados a propósito: ${IGNORADOS.length} (paneles del HUD con texto en inglés)`);

if (faltan.length > 0) {
    console.log(`  FALTAN ${faltan.length} dibujos:`);

    faltan.forEach((ruta) => console.log(`    - ${ruta}`));
} else {
    console.log("  Todos los dibujos referenciados existen.");
}

if (sobran.length > 0) {
    console.log(`  Sin usar (${sobran.length}):`);

    sobran.forEach((ruta) => console.log(`    - ${ruta}`));
} else {
    console.log("  No sobra ningún dibujo.");
}

console.log("");
process.exitCode = faltan.length > 0 ? 1 : 0;

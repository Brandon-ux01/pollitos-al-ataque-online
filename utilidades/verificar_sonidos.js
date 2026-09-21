/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Verificador de sonidos
 * =========================================================
 *
 * Utilidad de desarrollo: compara los archivos de audio que espera el juego
 * (js/configuracion/configuracion_sonido.js) con los que hay realmente en
 * assets/sonidos/ y avisa de lo que falta o de lo que sobra.
 *
 * No crea, modifica ni convierte ningún archivo de audio.
 *
 * Uso:
 *   npm run sonidos
 *   node utilidades/verificar_sonidos.js
 */

const path = require("node:path");

const CONFIGURACION = require("../js/configuracion/configuracion_sonido");
const { listarArchivosDeAudio, normalizarNombre } = require("../servidor/sonidos");

const RAIZ = path.join(__dirname, "..", CONFIGURACION.carpetaBase);
const EXTENSIONES = CONFIGURACION.extensiones;

const archivos = listarArchivosDeAudio(RAIZ, EXTENSIONES.concat(["m4a", "aac"]));
const porNombre = new Map();

archivos.forEach((archivo) => {
    porNombre.set(archivo.clave, archivo);
});

/**
 * Busca el archivo real de una ruta configurada (o de sus alias).
 *
 * @param {string} rutaBase Ruta configurada sin extensión.
 * @param {string[]} alias Rutas alternativas.
 * @returns {object|null} Archivo encontrado.
 */
function buscarArchivo(rutaBase, alias = []) {
    const candidatas = [rutaBase, ...(alias || [])];

    for (const candidata of candidatas) {
        const encontrado = porNombre.get(normalizarNombre(candidata));

        if (encontrado) {
            return encontrado;
        }
    }

    return null;
}

/* ---------------------------------------------------------
   Revisión de la configuración
   --------------------------------------------------------- */

const esperados = [];

if (CONFIGURACION.musicaMenu) {
    esperados.push({
        descripcion: "Música del menú",
        ruta: CONFIGURACION.musicaMenu,
        alias: CONFIGURACION.aliasMusicaMenu,
        obligatorio: true
    });
}

if (CONFIGURACION.musicaBatalla) {
    esperados.push({
        descripcion: "Música de batalla",
        ruta: CONFIGURACION.musicaBatalla,
        alias: CONFIGURACION.aliasMusicaBatalla,
        obligatorio: true
    });
}

Object.entries(CONFIGURACION.musicasEscenarios || {}).forEach(([numero, ruta]) => {
    esperados.push({ descripcion: `Música del escenario ${numero}`, ruta, alias: [], obligatorio: false });
});

Object.entries(CONFIGURACION.efectos || {}).forEach(([clave, ruta]) => {
    if (ruta) {
        esperados.push({
            descripcion: `Efecto "${clave}"`,
            ruta,
            alias: (CONFIGURACION.aliasEfectos || {})[clave] || [],
            obligatorio: true
        });
    }
});

const usados = new Set();
let encontrados = 0;

console.log("");
console.log("=========================================================");
console.log("  VERIFICACIÓN DE SONIDOS - POLLITOS AL ATAQUE");
console.log(`  Carpeta: ${CONFIGURACION.carpetaBase}`);
console.log(`  Formatos soportados: ${EXTENSIONES.map((e) => `.${e}`).join(", ")}`);
console.log("=========================================================");
console.log("");

esperados.forEach((esperado) => {
    const archivo = buscarArchivo(esperado.ruta, esperado.alias);

    if (archivo) {
        encontrados += 1;
        usados.add(archivo.ruta);
        console.log(`  [OK]      ${esperado.descripcion.padEnd(26)} ${archivo.ruta}`);
    } else {
        const estado = esperado.obligatorio ? "[FALTA]" : "[OPCIONAL]";
        console.log(`  ${estado.padEnd(10)}${esperado.descripcion.padEnd(26)} ${esperado.ruta}.(mp3|wav|ogg)`);

        if (esperado.alias.length) {
            console.log(`            alias probados: ${esperado.alias.join(", ")}`);
        }
    }
});

/* ---------------------------------------------------------
   Archivos que sobran
   --------------------------------------------------------- */

const sobrantes = archivos.map((archivo) => archivo.ruta).filter((ruta) => !usados.has(ruta));

console.log("");
console.log("---------------------------------------------------------");
console.log(`  Archivos esperados:   ${esperados.length}`);
console.log(`  Archivos encontrados: ${encontrados}`);
console.log(`  Sin archivo todavía:  ${esperados.length - encontrados}`);

if (sobrantes.length) {
    console.log("");
    console.log("  Archivos de audio no usados por la configuración:");
    sobrantes.forEach((ruta) => console.log(`    - ${ruta}`));
    console.log("  (Si son sonidos nuevos, decláralos en js/configuracion/configuracion_sonido.js)");
}

console.log("---------------------------------------------------------");
console.log("");

if (!encontrados) {
    console.log("  Consejo: coloca los archivos en las carpetas indicadas de");
    console.log("  assets/sonidos/ y vuelve a ejecutar \"npm run sonidos\".");
    console.log("");
}

// Nunca se devuelve error: el juego funciona igual sin archivos de audio.
process.exitCode = 0;

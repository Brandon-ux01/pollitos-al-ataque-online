/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Listado de archivos de audio
 * =========================================================
 *
 * Módulo compartido por:
 *  - servidor/servidor.js  → publica la lista en GET /api/sonidos
 *  - utilidades/verificar_sonidos.js → informa de lo que falta
 *
 * Motivo (problema real detectado): los nombres de los archivos de audio
 * pueden no coincidir con los esperados ("explocion" en vez de "explosion",
 * "fondo_de_munu_principal" en vez de "fondo_de_menu_principal"...). Con este
 * listado el cliente conoce los NOMBRES REALES y los reproduce sin fallos,
 * en lugar de adivinar rutas que devuelven 404.
 *
 * No crea, modifica ni convierte ningún archivo: solo los lee.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Devuelve el nombre de archivo sin extensión y normalizado para comparar:
 * minúsculas, sin acentos, sin espacios, guiones ni guiones bajos.
 *
 * Ejemplo: "Disparo_de_cañón.MP3" -> "disparodecanon"
 *
 * @param {string} nombre Nombre o ruta de archivo.
 * @returns {string} Nombre normalizado.
 */
function normalizarNombre(nombre) {
    return path.basename(nombre, path.extname(nombre))
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Lista recursivamente los archivos de audio de una carpeta.
 *
 * @param {string} carpetaRaiz Carpeta a recorrer (por ejemplo assets/sonidos).
 * @param {string[]} extensiones Extensiones consideradas audio.
 * @returns {Array} Lista de { ruta, nombre, extension, tamano } con rutas relativas.
 */
function listarArchivosDeAudio(carpetaRaiz, extensiones) {
    const encontrados = [];
    const extensionesLimpias = (extensiones || ["mp3", "wav", "ogg"]).map((extension) => {
        return String(extension).replace(".", "").toLowerCase();
    });

    const recorrer = (carpeta) => {
        if (!fs.existsSync(carpeta)) {
            return;
        }

        fs.readdirSync(carpeta, { withFileTypes: true }).forEach((entrada) => {
            const completa = path.join(carpeta, entrada.name);

            if (entrada.isDirectory()) {
                recorrer(completa);
                return;
            }

            const extension = path.extname(entrada.name).replace(".", "").toLowerCase();

            if (!extensionesLimpias.includes(extension)) {
                return;
            }

            const estadisticas = fs.statSync(completa);

            encontrados.push({
                ruta: path.relative(carpetaRaiz, completa).replace(/\\/g, "/"),
                nombre: entrada.name,
                extension,
                tamano: estadisticas.size,
                clave: normalizarNombre(entrada.name)
            });
        });
    };

    recorrer(carpetaRaiz);

    // Orden estable para que la salida sea siempre igual y fácil de leer.
    encontrados.sort((a, b) => a.ruta.localeCompare(b.ruta));

    return encontrados;
}

module.exports = { listarArchivosDeAudio, normalizarNombre };

/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Configuración de sonido
 * =========================================================
 *
 * ÚNICO lugar donde se declaran las rutas de audio del juego.
 * js/sonido.js no contiene ninguna ruta: solo lee este archivo.
 *
 * ⚠️ NOMBRES REALES DE LOS ARCHIVOS (comprobados en el proyecto):
 *
 *   assets/sonidos/musica/menu/fondo_de_munu_principal.mp3   <- "munu"
 *   assets/sonidos/musica/batalla/fondo_de_la_batalla.mp3
 *   assets/sonidos/efectos/jugadores/cambio_de_jugador.wav
 *   assets/sonidos/efectos/armas/disparo_de_cañon.mp3        <- sin tilde
 *   assets/sonidos/efectos/armas/explocion.mp3               <- "explocion"
 *   assets/sonidos/efectos/interfaz/seleccionar_boton_menu.mp3
 *   assets/sonidos/efectos/partida/game over.mp3              <- con espacio
 *
 * Esos nombres (con sus erratas y sin tildes) son los que busca el juego,
 * porque son los que existen de verdad. Así dejaron de devolver 404.
 *
 * Cómo se escriben las rutas:
 *  - SIN extensión: el sistema prueba .mp3, .wav y .ogg automáticamente.
 *  - Los "alias" permiten que el juego siga funcionando si más adelante
 *    renombras los archivos a su nombre correcto. Ejemplo: si arreglas
 *    "explocion.mp3" a "explosion.mp3", ya está cubierto por el alias.
 *  - El valor null significa "todavía no hay archivo": ese evento se queda en
 *    silencio, sin avisos y sin inventar nombres.
 *
 * El listado real de archivos lo publica el servidor en GET /api/sonidos
 * (ver servidor/servidor.js): el cliente compara nombres normalizados y usa la
 * ruta exacta que existe, aunque el archivo cambie de nombre o de extensión.
 */

const CONFIGURACION_SONIDO = {
    /** Carpeta raíz de todo el audio del juego. */
    carpetaBase: "assets/sonidos/",

    /** Extensiones soportadas, en orden de búsqueda. */
    extensiones: ["mp3", "wav", "ogg"],

    /**
     * Mensajes de diagnóstico en la consola del navegador.
     * Ponlo en false cuando ya no necesites depurar: los errores importantes
     * (archivo no encontrado o reproducción bloqueada) se avisan igualmente.
     */
    depuracion: true,

    /**
     * Listado de archivos reales que publica el servidor.
     * Si el cliente no está servido por el servidor (por ejemplo con Vite),
     * se pide a la dirección del servidor de juego.
     */
    manifiestoSonidos: "/api/sonidos",

    /** Clave de localStorage donde se guardan las preferencias de audio. */
    clavePreferencias: "pollitos.sonido",

    /** Valores iniciales de las preferencias (0 a 1 en los volúmenes). */
    preferenciasPorDefecto: {
        musicaActivada: true,
        efectosActivados: true,
        volumenMusica: 0.6,
        volumenEfectos: 0.8
    },

    /**
     * Límites técnicos del mezclador.
     *  - maximoEfectosSimultaneos: cuántos efectos pueden sonar a la vez.
     *  - tiempoMinimoRepeticion: milisegundos mínimos entre dos reproducciones
     *    del mismo efecto (evita duplicados por un solo clic o por procesar
     *    dos veces el mismo evento de red).
     */
    maximoEfectosSimultaneos: 6,
    tiempoMinimoRepeticion: 90,

    /** Milisegundos de espera al pedir el listado de archivos al servidor. */
    tiempoEsperaManifiesto: 4000
};

Object.assign(CONFIGURACION_SONIDO, {
    /* -----------------------------------------------------
       MÚSICA (nombres reales + alias)
       ----------------------------------------------------- */

    /** Música del menú principal (bucle). ARCHIVO EXISTENTE. */
    musicaMenu: "musica/menu/fondo_de_munu_principal",
    aliasMusicaMenu: [
        "musica/menu/fondo_de_menu_principal" // nombre correcto, por si lo renombras
    ],

    /** Música general de las batallas (bucle). ARCHIVO EXISTENTE. */
    musicaBatalla: "musica/batalla/fondo_de_la_batalla",
    aliasMusicaBatalla: [],

    /**
     * Música propia de cada escenario (bucle).
     * Cuando exista el archivo, sustituye a la música de batalla; si no,
     * el sistema usa automáticamente la música de batalla.
     */
    musicasEscenarios: {
        1: "musica/escenarios/escenario_1",
        2: "musica/escenarios/escenario_2",
        3: "musica/escenarios/escenario_3",
        4: "musica/escenarios/escenario_4"
    },

    /* -----------------------------------------------------
       EFECTOS DE SONIDO (nombres reales + alias)
       ----------------------------------------------------- */

    efectos: {
        /* --- Jugadores ------------------------------------------------ */
        // ARCHIVO EXISTENTE (.wav): al empezar el turno de un jugador.
        cambioDeJugador: "efectos/jugadores/cambio_de_jugador",

        /* --- Armas ---------------------------------------------------- */
        // ARCHIVO EXISTENTE: disparo del cañón (una vez por disparo).
        disparo: "efectos/armas/disparo_de_cañon",
        // ARCHIVO EXISTENTE: explosión (una vez por explosión).
        explosion: "efectos/armas/explocion",

        /* --- Interfaz ------------------------------------------------- */
        // ARCHIVO EXISTENTE: cualquier botón del juego.
        boton: "efectos/interfaz/seleccionar_boton_menu",

        /* --- Partida -------------------------------------------------- */
        // ARCHIVO EXISTENTE: al terminar la partida (victoria o derrota).
        gameOver: "efectos/partida/game over",

        /* --- Pendientes (se quedan en silencio, sin inventar nombres) --- */
        conexion: null, // sugerido: efectos/jugadores/entrada_de_jugador
        desconexion: null, // sugerido: efectos/jugadores/salida_de_jugador
        salto: null, // sugerido: efectos/jugadores/salto_de_pollito
        paso: null, // sugerido: efectos/jugadores/pasos
        danio: null, // sugerido: efectos/jugadores/danio_recibido
        muerte: null, // sugerido: efectos/jugadores/muerte_de_jugador
        impacto: null, // sugerido: efectos/armas/impacto_de_proyectil
        inicioPartida: null, // sugerido: efectos/partida/inicio_de_partida
        cuentaAtras: null, // sugerido: efectos/partida/cuenta_atras
        victoria: null, // sugerido: efectos/partida/victoria
        derrota: null // sugerido: efectos/partida/derrota
    },

    /**
     * Nombres alternativos por efecto: se prueban después del principal.
     * Sirven para que el juego siga sonando si renombras los archivos.
     */
    aliasEfectos: {
        cambioDeJugador: ["efectos/jugadores/cambio_jugador"],
        disparo: ["efectos/armas/disparo_de_cañón", "efectos/armas/disparo_del_canon"],
        explosion: ["efectos/armas/explosion"],
        boton: ["efectos/interfaz/seleccionar_boton"],
        gameOver: ["efectos/partida/game_over"]
    },

    /** Escenario por defecto si el servidor no envía ninguno. */
    escenarioPorDefecto: 1
});

// Permite usar esta configuración desde Node (utilidades/verificar_sonidos.js)
// sin duplicar rutas en ningún otro archivo.
if (typeof module !== "undefined" && module.exports) {
    module.exports = CONFIGURACION_SONIDO;
}


/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Configuración del cliente
 * =========================================================
 *
 * Contiene:
 *  - La resolución de la dirección del servidor (local, red o Internet).
 *  - Las opciones visuales del jugador (nombres y ayuda de controles).
 *  - Constantes de presentación (cañón y potencia dibujados).
 *
 * El AUDIO no se configura aquí: sus preferencias y sus rutas viven en
 * js/configuracion/configuracion_sonido.js y js/sonido.js.
 *
 * Las constantes FÍSICAS tampoco están aquí: viven en el servidor
 * (servidor/config.js) y llegan al cliente dentro del paquete
 * "partida:inicio" para que nunca haya dos copias que se desincronicen.
 */

const CONFIG_CLIENTE = {
    // Puerto donde escucha el servidor de Socket.IO.
    //
    // Debe coincidir con el servidor autoritativo (servidor/servidor.js:
    // PUERTO = process.env.PORT || 3001) y con utilidades/iniciar_todo.js, que
    // arranca el servidor en el 3001. Si aquí hubiera otro número, el cliente
    // intentaría conectarse a un puerto donde no hay nadie y el multijugador
    // no funcionaría (se puede cambiar sin tocar código con ?servidor=...).
    PUERTO_SERVIDOR: 3210,

    // Ancho máximo del canvas jugable (el servidor manda el tamaño real).
    ANCHO_POR_DEFECTO: 1200,
    ALTO_POR_DEFECTO: 600,

    // Suavizado del movimiento: cuánto se acerca la vista al último estado.
    SUAVIZADO: 14,
    SUAVIZADO_LOCAL: 22,

    /* --- Valores SOLO de presentación -----------------------------------
       Se usan para dibujar el cañón y la barra de potencia. La simulación
       real ocurre en el servidor (servidor/config.js) y debe coincidir para
       que el dibujo no engañe al jugador. */
    LONGITUD_CANON: 34,
    POTENCIA_MINIMA: 250,
    POTENCIA_MAXIMA: 620,

    // Frecuencia de envío de la entrada del jugador (milisegundos).
    FRECUENCIA_ENTRADA: 50,

    // Claves de almacenamiento local.
    CLAVE_NOMBRE: "pollitos.nombre",
    CLAVE_SERVIDOR: "pollitos.servidor",
    CLAVE_OPCIONES: "pollitos.opciones"
};

/**
 * Resuelve la dirección del servidor de juego.
 *
 * Prioridad:
 *  1. Parámetro de la URL:  ?servidor=https://mi-servidor.com
 *  2. Valor guardado en el navegador (se guarda al usar el parámetro).
 *  3. Si la página ya se sirve desde el propio servidor (puerto 3001),
 *     se usa el mismo origen (funciona en Internet sin configurar nada).
 *  4. En desarrollo (Vite en 5173) se usa el mismo host y el puerto 3001.
 *
 * @returns {string} URL base del servidor, sin barra final.
 */
function resolverUrlServidor() {
    try {
        const parametro = new URLSearchParams(window.location.search).get("servidor");

        if (parametro) {
            const limpio = parametro.replace(/\/+$/, "");
            window.localStorage.setItem(CONFIG_CLIENTE.CLAVE_SERVIDOR, limpio);
            return limpio;
        }

        const guardado = window.localStorage.getItem(CONFIG_CLIENTE.CLAVE_SERVIDOR);

        if (guardado) {
            return guardado.replace(/\/+$/, "");
        }
    } catch (error) {
        // Si el navegador bloquea el almacenamiento, se sigue con la deducción.
    }

    const { protocol, hostname, port, origin } = window.location;

    if (port === String(CONFIG_CLIENTE.PUERTO_SERVIDOR)) {
        return origin;
    }

    const protocoloServidor = protocol === "https:" ? "https:" : "http:";
    return `${protocoloServidor}//${hostname || "localhost"}:${CONFIG_CLIENTE.PUERTO_SERVIDOR}`;
}

/**
 * Opciones del jugador que afectan solo a la presentación.
 *
 * El sonido y la música NO están aquí: sus preferencias las guarda y aplica
 * js/sonido.js (clave "pollitos.sonido"), de modo que cada sistema tiene un
 * único dueño y no hay valores duplicados.
 */
const OpcionesJuego = {
    valores: {
        mostrarNombres: true,
        mostrarAyuda: true
    },

    /** Carga las opciones guardadas. */
    cargar() {
        try {
            const guardadas = JSON.parse(window.localStorage.getItem(CONFIG_CLIENTE.CLAVE_OPCIONES) || "{}");
            this.valores = { ...this.valores, ...guardadas };
        } catch (error) {
            this.valores = { ...this.valores };
        }

        return this.valores;
    },

    /**
     * Cambia una opción concreta y la persiste.
     *
     * @param {string} clave Nombre de la opción.
     * @param {*} valor Nuevo valor.
     */
    establecer(clave, valor) {
        this.valores[clave] = valor;

        try {
            window.localStorage.setItem(CONFIG_CLIENTE.CLAVE_OPCIONES, JSON.stringify(this.valores));
        } catch (error) {
            // Sin almacenamiento las opciones solo duran la sesión.
        }
    },

    /** Guarda el nombre del jugador para la próxima visita. */
    guardarNombre(nombre) {
        try {
            window.localStorage.setItem(CONFIG_CLIENTE.CLAVE_NOMBRE, nombre);
        } catch (error) {
            // Sin almacenamiento el nombre no se recuerda.
        }
    },

    /** Recupera el nombre guardado. */
    leerNombre() {
        try {
            return window.localStorage.getItem(CONFIG_CLIENTE.CLAVE_NOMBRE) || "";
        } catch (error) {
            return "";
        }
    }
};

OpcionesJuego.cargar();

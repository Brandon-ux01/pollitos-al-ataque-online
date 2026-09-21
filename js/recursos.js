/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Recursos gráficos (imágenes)
 * =========================================================
 *
 * ÚNICO dueño de los dibujos del juego: carga, caché y ayudas de dibujo.
 * Ningún otro archivo crea objetos Image ni escribe rutas de assets/imagenes.
 *
 * Ventajas de tenerlo todo aquí:
 *  - Una imagen se descarga UNA vez y la comparten todos los que la dibujan.
 *  - Si un dibujo todavía no ha terminado de cargar, obtener() devuelve null y
 *    quien lo pide dibuja su versión vectorial de respaldo. Así el juego NUNCA
 *    se queda en blanco por culpa de una imagen que falta.
 *
 * Estructura de assets/imagenes (generada por utilidades/preparar_imagenes.ps1):
 *   personajes/<clave>/<estado>.png   -> 6 pollitos x 6 estados
 *   escenarios/fondo_menu.png         -> lámina de fondo del menú
 *   escenarios/cancha/*.png           -> plataformas, árboles, arbustos y rocas
 *   interfaz/botones/*.png            -> botones con su texto ya dibujado
 *   interfaz/armas/*.png              -> cañón y bazuca (adorno del menú)
 *   interfaz/resultados/*.png         -> láminas de victoria y derrota
 *   interfaz/hud/*.png                -> paneles del HUD
 *
 * NOTA sobre los cuatro paneles de interfaz/hud (panel_jugadores, panel_lobby,
 * tarjeta_turno y barra_nombres): llevan rótulos en INGLÉS dibujados dentro de
 * la imagen ("NAMES", "STATUS", "TURN", "HEALTH"). Por eso NO se usan: el HUD
 * se dibuja en el canvas (js/interfaz.js) con el mismo estilo pero en español.
 * Si algún día se rehacen esos rótulos, basta con dibujarlos aquí.
 */

/** Carpeta raíz de todos los dibujos. */
const CARPETA_ARTE = "assets/imagenes";

/**
 * Estados de un pollito y el archivo que le corresponde.
 *
 * El fotograma elegido para cada estado lo decide el script que recorta las
 * hojas originales (utilidades/preparar_imagenes.ps1, tabla $Fotogramas).
 */
const ARCHIVOS_POLLITO = {
    quieto: "quieto",
    caminar: "caminar",
    salto: "salto",
    disparo: "disparo",
    danio: "danio",
    muerto: "muerto"
};

/**
 * Carpeta de cada personaje, en el MISMO orden que los índices del servidor
 * (servidor/config.js -> PERSONAJES). El índice 0 es el pollito clásico.
 */
const CARPETAS_POLLITO = [
    "0_amarillo",
    "1_lentes",
    "2_chaleco",
    "3_morado",
    "4_naranja",
    "5_verde"
];

/**
 * Cañón y bazuca dibujados del juego original.
 *
 * Se usan como ADORNO del menú (alineados con el logotipo): a tamaño de
 * personaje (34 px de barril) el dibujo pierde todo el detalle y se ve como un
 * borrón, así que el cañón de la partida se dibuja con formas. Las medidas de
 * abajo están calculadas por utilidades/prueba_arma.ps1: el barril apunta a
 * -36 grados y mide 269 px desde su culata.
 */
const DIBUJOS_ARMA = {
    canon: {
        recurso: "interfaz/armas/canon",
        angulo: -36,
        largo: 269,
        pivoteX: 0.174,
        pivoteY: 0.743,
        recorte: 46
    },
    bazuca: {
        recurso: "interfaz/armas/bazuca",
        angulo: -34,
        largo: 250,
        pivoteX: 0.18,
        pivoteY: 0.72,
        recorte: 48
    }
};

const Recursos = {
    /** ruta relativa -> { imagen, listo, fallo } */
    cache: new Map(),

    /** Contadores de carga (solo para el registro de la consola). */
    pedidas: 0,
    cargadas: 0,
    falladas: 0,

    /**
     * Ruta completa de un dibujo.
     *
     * @param {string} recurso Ruta relativa sin extensión.
     * @returns {string} Ruta lista para usar en src o drawImage.
     */
    ruta(recurso) {
        return `${CARPETA_ARTE}/${recurso}.png`;
    },

    /**
     * Pide un dibujo (lo carga la primera vez y lo reutiliza después).
     *
     * @param {string} recurso Ruta relativa sin extensión.
     * @returns {object} { imagen, listo, fallo }
     */
    pedir(recurso) {
        if (this.cache.has(recurso)) {
            return this.cache.get(recurso);
        }

        const entrada = { imagen: null, listo: false, fallo: false };
        this.cache.set(recurso, entrada);
        this.pedidas += 1;

        const imagen = new Image();
        entrada.imagen = imagen;

        imagen.addEventListener("load", () => {
            entrada.listo = true;
            this.cargadas += 1;
        });

        imagen.addEventListener("error", () => {
            entrada.fallo = true;
            this.falladas += 1;
            console.warn(`[ARTE] Falta el dibujo ${this.ruta(recurso)}: se usará el dibujo vectorial.`);
        });

        imagen.src = this.ruta(recurso);

        return entrada;
    },

    /**
     * Imagen ya cargada de un dibujo.
     *
     * @param {string} recurso Ruta relativa sin extensión.
     * @returns {HTMLImageElement|null} null mientras no esté lista.
     */
    imagen(recurso) {
        const entrada = this.pedir(recurso);

        return entrada.listo ? entrada.imagen : null;
    },

    /**
     * Ficha de un pollito con la ruta de cada uno de sus estados.
     *
     * @param {number} indice Índice del personaje (0..5).
     * @returns {object} { clave, indice, estados }
     */
    pollito(indice) {
        const posicion = Math.max(0, Math.min(CARPETAS_POLLITO.length - 1, Number(indice) || 0));
        const clave = CARPETAS_POLLITO[posicion];

        if (!this._pollitos) {
            this._pollitos = new Map();
        }

        if (!this._pollitos.has(clave)) {
            const estados = {};

            Object.keys(ARCHIVOS_POLLITO).forEach((estado) => {
                estados[estado] = `personajes/${clave}/${ARCHIVOS_POLLITO[estado]}`;
            });

            this._pollitos.set(clave, { clave, indice: posicion, estados });
        }

        return this._pollitos.get(clave);
    },

    /**
     * Ruta (sin extensión) del dibujo de un estado de un pollito.
     *
     * @param {number} indice Índice del personaje.
     * @param {string} estado quieto, caminar, salto, disparo, danio o muerto.
     * @returns {string} Ruta relativa sin extensión.
     */
    rutaPollito(indice, estado = "quieto") {
        const ficha = this.pollito(indice);
        const clave = ARCHIVOS_POLLITO[estado] ? estado : "quieto";

        return ficha.estados[clave];
    },

    /**
     * Ruta completa (con carpeta y .png) del dibujo de un pollito.
     *
     * @param {number} indice Índice del personaje.
     * @param {string} estado Estado de dibujo.
     * @returns {string} Ruta lista para un src o para pedir().
     */
    rutaPollitoCompleta(indice, estado = "quieto") {
        return this.ruta(this.rutaPollito(indice, estado));
    },

    /**
     * Pide todos los dibujos que puede necesitar una partida.
     *
     * Se llama al arrancar el cliente y NO bloquea nada: los dibujos van
     * apareciendo a medida que llegan y, mientras tanto, cada sistema usa su
     * versión vectorial de respaldo.
     *
     * @returns {Array<string>} Lista de rutas pedidas.
     */
    precargarTodo() {
        const lista = [];

        CARPETAS_POLLITO.forEach((clave, indice) => {
            Object.keys(ARCHIVOS_POLLITO).forEach((estado) => {
                lista.push(this.rutaPollito(indice, estado));
            });
        });

        [
            "escenarios/fondo_menu",
            "escenarios/cancha/plataforma_larga",
            "escenarios/cancha/plataforma_media",
            "escenarios/cancha/plataforma_corta",
            "escenarios/cancha/plataforma_rocosa",
            "escenarios/cancha/plataforma_baja",
            "escenarios/cancha/pino",
            "escenarios/cancha/pino_alto",
            "escenarios/cancha/arbol",
            "escenarios/cancha/arbusto_alto",
            "escenarios/cancha/arbusto_redondo",
            "escenarios/cancha/arbusto_ancho",
            "escenarios/cancha/agave",
            "escenarios/cancha/roca_grande",
            "escenarios/cancha/roca_media",
            "escenarios/cancha/roca_alta",
            "escenarios/cancha/piedras",
            DIBUJOS_ARMA.canon.recurso,
            DIBUJOS_ARMA.bazuca.recurso,
            "interfaz/resultados/victoria",
            "interfaz/resultados/derrota"
        ].forEach((recurso) => lista.push(recurso));

        lista.forEach((recurso) => this.pedir(recurso));

        return lista;
    },

    /** Resumen de la carga, para el registro de la consola. */
    resumen() {
        return `${this.cargadas}/${this.pedidas} dibujos cargados` +
            (this.falladas > 0 ? ` (${this.falladas} no encontrados)` : "");
    },

    /**
     * Dibuja una imagen ajustada a un alto, centrada y apoyada en un punto.
     *
     * Es la forma habitual de dibujar un personaje: se le da el centro
     * horizontal, la altura deseada y la línea del suelo, y la imagen se
     * escala sola para no deformarse nunca.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @param {HTMLImageElement} imagen Dibujo a pintar.
     * @param {number} centroX Centro horizontal.
     * @param {number} pieY Línea donde se apoyan los pies del dibujo.
     * @param {number} alto Alto final en píxeles del mundo.
     * @param {number} espejo 1 dibuja igual, -1 lo dibuja mirando al otro lado.
     * @returns {boolean} true si se ha dibujado algo.
     */
    dibujarAjustado(ctx, imagen, centroX, pieY, alto, espejo = 1) {
        if (!imagen || !imagen.naturalWidth || !alto) {
            return false;
        }

        const ancho = alto * (imagen.naturalWidth / imagen.naturalHeight);

        ctx.save();
        ctx.translate(centroX, pieY);
        ctx.scale(espejo < 0 ? -1 : 1, 1);
        ctx.drawImage(imagen, -ancho / 2, -alto, ancho, alto);
        ctx.restore();

        return true;
    },

    /**
     * Dibuja la cara del pollito dentro de un marco redondeado (estilo de la
     * ficha chip_avatar.png, pero con el dibujo de cada personaje de verdad).
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @param {number} indice Índice del personaje.
     * @param {number} x Esquina izquierda del marco.
     * @param {number} y Esquina superior del marco.
     * @param {number} lado Lado del marco cuadrado.
     * @param {object} opciones { vivo, borde }
     * @returns {boolean} true si se ha dibujado la ficha.
     */
    dibujarFicha(ctx, indice, x, y, lado, opciones = {}) {
        const imagen = this.imagen(this.rutaPollito(indice, "quieto"));

        if (!imagen) {
            return false;
        }

        const vivo = opciones.vivo !== false;
        const borde = opciones.borde || "rgba(120, 210, 255, 0.85)";
        const margen = Math.max(2, lado * 0.08);
        const interior = lado - margen * 2;
        const altoCara = interior * 1.15;

        ctx.save();

        // Fondo del marco.
        ctx.beginPath();
        ctx.roundRect(x, y, lado, lado, lado * 0.28);
        ctx.fillStyle = "rgba(9, 32, 54, 0.95)";
        ctx.fill();

        // Cara del pollito recortada por el marco.
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + margen, y + margen, interior, interior, interior * 0.24);
        ctx.clip();
        ctx.globalAlpha = vivo ? 1 : 0.45;
        this.dibujarAjustado(ctx, imagen, x + lado / 2, y + margen + interior * 0.98, altoCara);
        ctx.restore();

        // Marco y brillo superior.
        ctx.lineWidth = Math.max(2, lado * 0.07);
        ctx.strokeStyle = vivo ? borde : "rgba(150, 165, 180, 0.7)";
        ctx.beginPath();
        ctx.roundRect(x, y, lado, lado, lado * 0.28);
        ctx.stroke();

        ctx.restore();

        return true;
    }
};

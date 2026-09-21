/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Sistema central de sonido
 * =========================================================
 *
 * ÚNICO módulo que reproduce audio en todo el proyecto. Ningún otro archivo
 * crea objetos Audio ni contiene rutas: todos llaman a las funciones de aquí
 * (window.sonidoJuego).
 *
 * CÓMO SE RESUELVEN LOS ARCHIVOS (esto es lo que estaba fallando):
 *
 *  1. Se pide al servidor el listado real de archivos (GET /api/sonidos).
 *     Con él se compara el nombre normalizado (sin acentos, sin espacios,
 *     sin guiones) y se usa la RUTA EXACTA que existe de verdad. Así funciona
 *     aunque el archivo se llame "fondo_de_munu_principal.mp3" o
 *     "explocion.mp3" (nombres reales del proyecto).
 *  2. Si el listado no está disponible, se prueban el nombre configurado y sus
 *     alias, con las extensiones .mp3, .wav y .ogg.
 *  3. Como último recurso se prueba la ruta contra la dirección del servidor.
 *
 * Otras garantías:
 *  - Diagnóstico claro en consola ("Cargando música del menú...", "Disparo
 *    reproducido", "ERROR: no se pudo reproducir...").
 *  - Si falta un archivo, avisa UNA vez y el juego sigue funcionando.
 *  - Sin autoplay forzado: si el navegador bloquea el audio, la pista queda
 *    pendiente y arranca con la primera interacción del usuario.
 *  - Precarga de todos los sonidos para que el primer clic ya suene.
 */

class Sonido {
    /**
     * @param {object} configuracion Configuración de sonido (rutas y límites).
     */
    constructor(configuracion) {
        this.configuracion = configuracion;

        /* --- Caché de archivos ------------------------------------------- */
        this.archivos = new Map(); // ruta configurada -> URL real o null.
        this.nombresReales = new Map(); // nombre normalizado -> ruta relativa real.
        this.avisosMostrados = new Set(); // rutas ya avisadas por consola.

        /* --- Estado de la música ---------------------------------------- */
        this.pistaSolicitada = null; // "menu", "batalla" o "escenario:N".
        this.pistaSonando = null;
        this.audioMusica = null;
        this.pausada = false;

        /* --- Estado de los efectos -------------------------------------- */
        this.efectosSonando = 0;
        this.ultimaReproduccion = new Map(); // clave -> marca de tiempo.

        /* --- Preferencias e interacción --------------------------------- */
        this.preferencias = this.leerPreferencias();
        this.interaccionDetectada = false;

        this.escucharPrimeraInteraccion();
        this.cargarManifiesto();
        this.precargarSonidos();

        this.depurar(`Sistema de sonido iniciado (${this.configuracion.carpetaBase}).`);
    }

    /* =====================================================
       Diagnóstico en consola
       ===================================================== */

    /**
     * Mensaje informativo (solo si la depuración está activada).
     *
     * @param {string} mensaje Texto a mostrar.
     */
    depurar(mensaje) {
        if (this.configuracion.depuracion) {
            console.log(`[SONIDO] ${mensaje}`);
        }
    }

    /**
     * Error de audio: SIEMPRE se muestra, nunca se oculta.
     *
     * El juego continúa funcionando aunque falle el audio.
     *
     * @param {string} mensaje Texto del error.
     * @param {string} detalle Detalle opcional (ruta, motivo del navegador...).
     */
    avisarError(mensaje, detalle = "") {
        console.error(`[SONIDO] ERROR: ${mensaje}${detalle ? ` (${detalle})` : ""}`);
    }

    /**
     * Avisa (una sola vez por ruta) de que un archivo no existe.
     *
     * @param {string[]|string} rutas Rutas probadas.
     */
    avisarArchivoFaltante(rutas) {
        const lista = Array.isArray(rutas) ? rutas : [rutas];
        const clave = lista.join("|");

        if (this.avisosMostrados.has(clave)) {
            return;
        }

        this.avisosMostrados.add(clave);

        const detalles = lista
            .map((ruta) => `  ${this.configuracion.carpetaBase}${ruta}`)
            .join("\n");

        console.warn(`[SONIDO] No se encontró:\n${detalles}`);
    }

    /* =====================================================
       Preferencias (localStorage)
       ===================================================== */

    /**
     * Lee las preferencias guardadas, completando las que falten.
     *
     * @returns {object} { musicaActivada, efectosActivados, volumenMusica, volumenEfectos }
     */
    leerPreferencias() {
        const base = { ...this.configuracion.preferenciasPorDefecto };

        try {
            const guardadas = JSON.parse(window.localStorage.getItem(this.configuracion.clavePreferencias) || "{}");

            if (typeof guardadas.musicaActivada === "boolean") {
                base.musicaActivada = guardadas.musicaActivada;
            }

            if (typeof guardadas.efectosActivados === "boolean") {
                base.efectosActivados = guardadas.efectosActivados;
            }

            if (Number.isFinite(guardadas.volumenMusica)) {
                base.volumenMusica = Math.max(0, Math.min(1, guardadas.volumenMusica));
            }

            if (Number.isFinite(guardadas.volumenEfectos)) {
                base.volumenEfectos = Math.max(0, Math.min(1, guardadas.volumenEfectos));
            }
        } catch (error) {
            this.avisarError("no se pudieron leer las preferencias de sonido", error.message);
        }

        return base;
    }

    /**
     * Guarda las preferencias indicadas (las no indicadas se conservan).
     *
     * @param {object} cambios Cambios a aplicar.
     * @returns {object} Preferencias resultantes.
     */
    guardarPreferencias(cambios = {}) {
        this.preferencias = { ...this.preferencias, ...cambios };

        try {
            window.localStorage.setItem(this.configuracion.clavePreferencias, JSON.stringify(this.preferencias));
            this.depurar(`Preferencias: música ${this.preferencias.musicaActivada ? "ON" : "OFF"}, efectos ${this.preferencias.efectosActivados ? "ON" : "OFF"}, volumen música ${Math.round(this.preferencias.volumenMusica * 100)}%, volumen efectos ${Math.round(this.preferencias.volumenEfectos * 100)}%.`);
        } catch (error) {
            this.avisarError("no se pudieron guardar las preferencias de sonido", error.message);
        }

        if (!this.preferencias.musicaActivada) {
            this.detenerMusica(true);
        } else if (this.pistaSolicitada && !this.pistaSonando) {
            this.reproducirPista(this.pistaSolicitada);
        }

        if (this.audioMusica) {
            this.audioMusica.volume = this.preferencias.volumenMusica;
        }

        return this.preferencias;
    }

    /* =====================================================
       Resolución de archivos
       ===================================================== */

    /**
     * Normaliza un nombre para comparar: minúsculas, sin acentos, sin espacios
     * ni separadores y sin extensión.
     *
     * @param {string} texto Nombre o ruta.
     * @returns {string} Nombre normalizado.
     */
    normalizar(texto) {
        const nombre = String(texto).split("/").pop().replace(/\.[a-z0-9]+$/i, "");

        return nombre
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "");
    }

    /**
     * Pide al servidor el listado real de archivos de audio.
     *
     * Así el cliente conoce los nombres verdaderos (incluidas sus erratas) y
     * deja de pedir rutas que devuelven 404.
     */
    async cargarManifiesto() {
        const direcciones = [
            `${resolverUrlServidor()}${this.configuracion.manifiestoSonidos}`,
            this.configuracion.manifiestoSonidos
        ];

        for (const direccion of direcciones) {
            const respuesta = await this.pedirConTiempo(direccion);

            if (!respuesta || !respuesta.ok) {
                continue;
            }

            try {
                const datos = await respuesta.json();
                const archivos = datos.archivos || [];

                archivos.forEach((archivo) => {
                    const ruta = archivo.ruta || "";
                    const nombre = ruta.split("/").pop() || "";
                    const carpeta = ruta.slice(0, ruta.length - nombre.length);

                    this.nombresReales.set(this.normalizar(nombre), `${carpeta}${nombre}`);
                });

                this.depurar(`Listado del servidor: ${archivos.length} archivos de audio encontrados.`);

                if (!archivos.length) {
                    console.warn("[SONIDO] El servidor no encontró archivos en assets/sonidos/: revisa la carpeta y los nombres.");
                }

                return;
            } catch (error) {
                this.depurar(`El listado de sonidos llegó ilegible desde ${direccion}: ${error.message}`);
            }
        }

        this.depurar("Sin listado del servidor: se usarán las rutas de la configuración y sus alias.");
    }

    /**
     * Petición fetch con límite de tiempo (nunca deja colgado al juego).
     *
     * @param {string} direccion URL a pedir.
     * @returns {Promise<Response|null>}
     */
    pedirConTiempo(direccion) {
        return new Promise((resolver) => {
            const controlador = typeof AbortController === "function" ? new AbortController() : null;

            const temporizador = setTimeout(() => {
                if (controlador) {
                    controlador.abort();
                }

                resolver(null);
            }, this.configuracion.tiempoEsperaManifiesto);

            fetch(direccion, controlador ? { signal: controlador.signal } : {})
                .then((respuesta) => {
                    clearTimeout(temporizador);
                    resolver(respuesta);
                })
                .catch(() => {
                    clearTimeout(temporizador);
                    resolver(null);
                });
        });
    }

    /**
     * Construye la URL completa de un recurso.
     *
     * @param {string} ruta Relativa dentro de assets/sonidos (con extensión).
     * @returns {string} URL relativa lista para el navegador.
     */
    construirUrl(ruta) {
        return encodeURI(`${this.configuracion.carpetaBase}${ruta}`);
    }

    /**
     * Comprueba si una URL de audio se puede cargar de verdad.
     *
     * @param {string} url URL a probar.
     * @returns {Promise<boolean>} true si el navegador puede con ella.
     */
    probarUrl(url) {
        return new Promise((resolver) => {
            const prueba = new Audio();
            prueba.preload = "metadata";

            const terminar = (resultado) => {
                prueba.removeAttribute("src");
                resolver(resultado);
            };

            prueba.addEventListener("loadedmetadata", () => terminar(true), { once: true });
            prueba.addEventListener("error", () => terminar(false), { once: true });
            prueba.src = url;
        });
    }

    /**
     * Devuelve las rutas candidatas para un recurso (principal + alias).
     *
     * @param {string} principal Ruta configurada.
     * @param {string[]} alias Rutas alternativas.
     * @returns {string[]} Rutas con extensión, en orden de prueba.
     */
    candidatas(principal, alias = []) {
        const bases = [principal, ...(alias || [])].filter(Boolean);
        const rutas = [];

        bases.forEach((base) => {
            // Si la ruta ya trae extensión se respeta tal cual.
            if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(base)) {
                rutas.push(base);
                return;
            }

            this.configuracion.extensiones.forEach((extension) => {
                rutas.push(`${base}.${extension}`);
            });
        });

        return rutas;
    }

    /**
     * Resuelve la URL real de un recurso de audio.
     *
     * Orden de búsqueda:
     *  1. El listado del servidor (nombre normalizado -> ruta exacta real).
     *  2. Las rutas configuradas y sus alias, probando extensiones.
     *  3. Esas mismas rutas contra la dirección del servidor.
     *
     * @param {string} principal Ruta configurada.
     * @param {string[]} alias Rutas alternativas.
     * @returns {Promise<string|null>} URL reproducible o null.
     */
    async resolverRecurso(principal, alias = []) {
        const clave = `${principal}|${(alias || []).join(",")}`;

        if (this.archivos.has(clave)) {
            return this.archivos.get(clave);
        }

        const candidatas = this.candidatas(principal, alias);

        // 1) Listado real del servidor.
        for (const candidata of candidatas) {
            const nombre = this.normalizar(candidata);
            const real = this.nombresReales.get(nombre);

            if (real) {
                const url = this.construirUrl(real);
                this.archivos.set(clave, url);
                this.depurar(`Archivo localizado: ${real}`);
                return url;
            }
        }

        // 2) Rutas de la configuración tal cual.
        for (const candidata of candidatas) {
            const url = this.construirUrl(candidata);

            if (await this.probarUrl(url)) {
                this.archivos.set(clave, url);
                this.depurar(`Archivo localizado: ${candidata}`);
                return url;
            }
        }

        // 3) Las mismas rutas servidas por el servidor de juego.
        const servidor = resolverUrlServidor();

        for (const candidata of candidatas) {
            const url = `${servidor}${this.construirUrl(candidata)}`;

            if (await this.probarUrl(url)) {
                this.archivos.set(clave, url);
                this.depurar(`Archivo servido por el servidor: ${candidata}`);
                return url;
            }
        }

        this.archivos.set(clave, null);
        this.avisarArchivoFaltante(candidatas);
        return null;
    }

    /* =====================================================
       MÚSICA
       ===================================================== */

    /** Reproduce la música del menú principal en bucle (ARCHIVO EXISTENTE). */
    reproducirMusicaMenu() {
        this.reproducirPista("menu");
    }

    /**
     * Reproduce la música del menú solo si no hay nada sonando.
     * Se usa al conectar, para no pisar la música de batalla.
     */
    reproducirMusicaDelMenuSiProcede() {
        if (this.pistaSonando || this.pistaSolicitada) {
            return;
        }

        this.reproducirPista("menu");
    }

    /** Reproduce la música general de batalla en bucle (ARCHIVO EXISTENTE). */
    reproducirMusicaBatalla() {
        this.reproducirPista("batalla");
    }

    /**
     * Reproduce la música propia de un escenario.
     *
     * Si el escenario todavía no tiene archivo, se usa la música de batalla
     * para que la partida nunca se quede en silencio.
     *
     * @param {number} numero Número de escenario.
     */
    async reproducirMusicaEscenario(numero) {
        const ruta = (this.configuracion.musicasEscenarios || {})[numero];

        if (!ruta) {
            this.reproducirMusicaBatalla();
            return;
        }

        const url = await this.resolverRecurso(ruta);

        if (!url) {
            this.depurar(`Escenario ${numero} sin música propia: se usa la música de batalla.`);
            this.reproducirMusicaBatalla();
            return;
        }

        this.reproducirPista(`escenario:${numero}`, url, `música del escenario ${numero}`);
    }

    /**
     * Reproduce la música que corresponde a una partida.
     *
     * @param {number} numeroEscenario Escenario enviado por el servidor.
     */
    reproducirMusicaDePartida(numeroEscenario) {
        const escenario = numeroEscenario || this.configuracion.escenarioPorDefecto;

        if ((this.configuracion.musicasEscenarios || {})[escenario]) {
            this.reproducirMusicaEscenario(escenario);
            return;
        }

        this.reproducirMusicaBatalla();
    }

    /**
     * Pone una pista de música (cambia de pista si hacía falta).
     *
     * @param {string} pista "menu", "batalla" o "escenario:N".
     * @param {string} urlForzada URL ya resuelta (opcional).
     * @param {string} descripcion Nombre legible para los mensajes.
     */
    async reproducirPista(pista, urlForzada = null, descripcion = "") {
        this.pistaSolicitada = pista;

        if (!this.preferencias.musicaActivada) {
            this.depurar("Música desactivada en opciones: no se reproduce nada.");
            return;
        }

        // Si ya suena esa misma pista, no se reinicia.
        if (this.pistaSonando === pista && this.audioMusica) {
            if (this.pausada) {
                this.reanudarMusica();
            }

            return;
        }

        const esMenu = pista === "menu";
        const ruta = esMenu ? this.configuracion.musicaMenu : this.configuracion.musicaBatalla;
        const alias = esMenu ? this.configuracion.aliasMusicaMenu : this.configuracion.aliasMusicaBatalla;
        const etiqueta = descripcion || (esMenu ? "música del menú" : pista === "batalla" ? "música de batalla" : pista);

        this.depurar(`Cargando ${etiqueta}...`);

        const url = urlForzada || await this.resolverRecurso(ruta, alias);

        if (this.pistaSolicitada !== pista) {
            // Mientras se resolvía, el juego pidió otra pista: no se solapan.
            return;
        }

        if (!url) {
            this.avisarError(`no se pudo reproducir la ${etiqueta}`, "archivo no encontrado");
            return;
        }

        this.detenerMusica(true);

        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = this.preferencias.volumenMusica;

        audio.addEventListener("error", () => {
            this.avisarError(`no se pudo reproducir la ${etiqueta}`, url);
        }, { once: true });

        this.audioMusica = audio;
        this.pistaSonando = pista;
        this.pausada = false;

        try {
            await audio.play();
            this.depurar(`${etiqueta} iniciada en bucle.`);
        } catch (error) {
            // Los navegadores bloquean el audio hasta la primera interacción.
            this.pistaSonando = null;
            this.depurar(`${etiqueta} pendiente: el navegador espera una interacción del usuario.`);
        }
    }

    /**
     * Detiene la música actual.
     *
     * @param {boolean} mantenerPistaSolicitada Si es true conserva la pista pedida.
     */
    detenerMusica(mantenerPistaSolicitada = false) {
        if (this.audioMusica) {
            try {
                this.audioMusica.pause();
                this.audioMusica.currentTime = 0;
            } catch (error) {
                // Se ignora.
            }

            this.audioMusica = null;
        }

        this.pistaSonando = null;
        this.pausada = false;

        if (!mantenerPistaSolicitada) {
            this.pistaSolicitada = null;
        }
    }

    /** Pausa la música actual (se puede reanudar por donde iba). */
    pausarMusica() {
        if (!this.audioMusica) {
            return;
        }

        try {
            this.audioMusica.pause();
            this.pausada = true;
            this.depurar("Música en pausa.");
        } catch (error) {
            this.avisarError("no se pudo pausar la música", error.message);
        }
    }

    /** Reanuda la música pausada (o la pista que quedó pendiente). */
    reanudarMusica() {
        if (!this.audioMusica) {
            if (this.pistaSolicitada) {
                this.reproducirPista(this.pistaSolicitada);
            }

            return;
        }

        this.audioMusica.volume = this.preferencias.volumenMusica;

        const promesa = this.audioMusica.play();

        if (promesa && typeof promesa.catch === "function") {
            promesa.catch((error) => {
                this.depurar(`La música sigue pendiente de interacción (${error.name}).`);
            });
        }

        this.pausada = false;
        this.depurar("Música reanudada.");
    }

    /**
     * Cambia el volumen de la música (0 a 1) y lo guarda.
     * Es independiente del volumen de efectos.
     *
     * @param {number} volumen Volumen de 0 a 1.
     */
    cambiarVolumenMusica(volumen) {
        const valor = Math.max(0, Math.min(1, Number(volumen) || 0));

        if (this.audioMusica) {
            this.audioMusica.volume = valor;
        }

        return this.guardarPreferencias({ volumenMusica: valor });
    }

    /**
     * Activa o desactiva la música.
     *
     * @param {boolean} activada Estado deseado.
     */
    activarMusica(activada) {
        return this.guardarPreferencias({ musicaActivada: Boolean(activada) });
    }

    /** Indica si hay música sonando ahora mismo. */
    get musicaSonando() {
        return Boolean(this.pistaSonando) && !this.pausada;
    }

    /* =====================================================
       EFECTOS DE SONIDO
       ===================================================== */

    /**
     * Reproduce un efecto del catálogo (núcleo de todos los efectos).
     *
     * Garantías:
     *  - Si la clave no tiene archivo configurado, no hace nada (silencio).
     *  - Si el archivo no existe, avisa UNA vez y el juego sigue.
     *  - Evita duplicados del mismo efecto en menos de tiempoMinimoRepeticion.
     *  - Permite varios efectos a la vez (hasta maximoEfectosSimultaneos).
     *
     * @param {string} clave Clave del efecto en la configuración.
     * @param {string} etiqueta Nombre legible para los mensajes de consola.
     * @returns {Promise<void>}
     */
    async reproducirEfecto(clave, etiqueta = "") {
        if (!this.preferencias.efectosActivados) {
            return;
        }

        const ruta = (this.configuracion.efectos || {})[clave];

        // Evento sin archivo todavía: silencio, sin advertencias.
        if (!ruta) {
            return;
        }

        const ahora = performance.now();
        const anterior = this.ultimaReproduccion.get(clave) || 0;

        if (ahora - anterior < this.configuracion.tiempoMinimoRepeticion) {
            return;
        }

        this.ultimaReproduccion.set(clave, ahora);

        if (this.efectosSonando >= this.configuracion.maximoEfectosSimultaneos) {
            this.depurar(`Demasiados efectos a la vez: se omite "${clave}".`);
            return;
        }

        const alias = (this.configuracion.aliasEfectos || {})[clave] || [];
        const url = await this.resolverRecurso(ruta, alias);

        if (!url) {
            this.avisarError(`no se pudo reproducir el efecto "${etiqueta || clave}"`, "archivo no encontrado");
            return;
        }

        const nombre = etiqueta || clave;

        try {
            const audio = new Audio(url);
            audio.volume = this.preferencias.volumenEfectos;
            this.efectosSonando += 1;

            const liberar = () => {
                this.efectosSonando = Math.max(0, this.efectosSonando - 1);
            };

            audio.addEventListener("ended", liberar, { once: true });
            audio.addEventListener("error", liberar, { once: true });

            const promesa = audio.play();

            if (promesa && typeof promesa.catch === "function") {
                promesa.catch((error) => {
                    // Bloqueado por el navegador: se libera el hueco y se sigue.
                    liberar();
                    this.depurar(`${nombre} pendiente (${error.name}): pulsa en la página para habilitar el audio.`);
                });
            }

            this.depurar(`${nombre} reproducido.`);
        } catch (error) {
            this.efectosSonando = Math.max(0, this.efectosSonando - 1);
            this.avisarError(`no se pudo reproducir el efecto "${nombre}"`, error.message);
        }
    }

    /** Cambio de jugador: una vez al empezar el turno del jugador que entra. */
    reproducirCambioDeJugador() {
        return this.reproducirEfecto("cambioDeJugador", "Cambio de jugador");
    }

    /** Disparo del cañón: una vez por disparo (lo lanza el evento del servidor). */
    reproducirDisparo() {
        return this.reproducirEfecto("disparo", "Disparo");
    }

    /** Explosión: una vez por explosión (pueden sonar varias a la vez). */
    reproducirExplosion() {
        return this.reproducirEfecto("explosion", "Explosión");
    }

    /** Botón de interfaz: lo llama el único manejador global de clics. */
    reproducirSonidoBoton() {
        return this.reproducirEfecto("boton", "Botón");
    }

    /** Game over: al terminar la partida (tanto victoria como derrota). */
    reproducirGameOver() {
        return this.reproducirEfecto("gameOver", "Game over");
    }

    /** Entrada de un jugador a la sala (pendiente de archivo). */
    reproducirEntradaDeJugador() {
        return this.reproducirEfecto("conexion", "Entrada de jugador");
    }

    /** Salida o desconexión de un jugador (pendiente de archivo). */
    reproducirSalidaDeJugador() {
        return this.reproducirEfecto("desconexion", "Salida de jugador");
    }

    /**
     * Cambia el volumen de los efectos (0 a 1) y lo guarda.
     * Es independiente del volumen de la música.
     *
     * @param {number} volumen Volumen de 0 a 1.
     */
    cambiarVolumenEfectos(volumen) {
        const valor = Math.max(0, Math.min(1, Number(volumen) || 0));
        return this.guardarPreferencias({ volumenEfectos: valor });
    }

    /**
     * Activa o desactiva los efectos de sonido.
     *
     * @param {boolean} activados Estado deseado.
     */
    activarEfectos(activados) {
        return this.guardarPreferencias({ efectosActivados: Boolean(activados) });
    }

    /** Libera el contador de efectos (al salir de una partida). */
    detenerEfectos() {
        this.efectosSonando = 0;
    }

    /* =====================================================
       Arranque: precarga y primera interacción
       ===================================================== */

    /**
     * Resuelve (sin reproducir) todos los sonidos del juego al arrancar.
     *
     * Motivo: la primera vez que se pulsa un botón, buscar el archivo tarda
     * unos milisegundos y el sonido podía perderse. Precargando, el primer clic
     * ya suena. Además deja en consola un resumen claro de lo que falta.
     */
    precargarSonidos() {
        setTimeout(async () => {
            const tareas = [
                this.resolverRecurso(this.configuracion.musicaMenu, this.configuracion.aliasMusicaMenu),
                this.resolverRecurso(this.configuracion.musicaBatalla, this.configuracion.aliasMusicaBatalla)
            ];

            Object.entries(this.configuracion.efectos || {}).forEach(([clave, ruta]) => {
                if (ruta) {
                    const alias = (this.configuracion.aliasEfectos || {})[clave] || [];
                    tareas.push(this.resolverRecurso(ruta, alias));
                }
            });

            const resultados = await Promise.all(tareas);
            const listos = resultados.filter(Boolean).length;

            this.depurar(`Precarga terminada: ${listos} de ${resultados.length} archivos listos.`);

            // Con la música del menú ya resuelta, se intenta arrancar el audio.
            if (this.interaccionDetectada) {
                this.reproducirMusicaDelMenuSiProcede();
            }
        }, 0);
    }

    /**
     * Registra la primera interacción del usuario.
     *
     * Los navegadores no permiten reproducir audio antes de una interacción.
     * No se fuerza nada: se anota la interacción y se arranca la música que
     * hubiera quedado pendiente (pulsar JUGAR, CREAR SALA, OPCIONES...).
     */
    escucharPrimeraInteraccion() {
        const activar = () => {
            if (this.interaccionDetectada) {
                return;
            }

            this.interaccionDetectada = true;
            this.depurar("El usuario interactuó con la página: el audio ya puede sonar.");

            if (this.pistaSolicitada && !this.pistaSonando) {
                this.reproducirPista(this.pistaSolicitada);
            }
        };

        window.addEventListener("pointerdown", activar, { once: true });
        window.addEventListener("keydown", activar, { once: true });
        window.addEventListener("touchstart", activar, { once: true });
    }
}

window.sonidoJuego = new Sonido(CONFIGURACION_SONIDO);

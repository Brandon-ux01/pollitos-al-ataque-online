/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Capa de red (Socket.IO)
 * =========================================================
 *
 * El cliente NO habla directamente con el motor del juego: solo envía
 * INTENCIONES (moverse, apuntar, cargar, disparar) y escucha estados.
 *
 * CORRECCIONES IMPORTANTES DE ESTE ARCHIVO
 * (eran la causa de que "CREAR SALA" y "UNIRSE A SALA" no funcionaran):
 *
 *  1. Antes, si pulsabas un botón antes de que el socket estuviera listo, se
 *     respondía "Todavía no hay conexión con el servidor" y el botón parecía
 *     roto. Ahora las acciones ESPERAN a la conexión (con tiempo máximo) y
 *     continúan solas.
 *  2. Ahora se escuchan connect_error, connect_timeout y reconnect_attempt, así
 *     que el usuario ve el motivo real (servidor apagado, puerto equivocado...)
 *     en vez de un "Conectando..." infinito.
 *  3. Los eventos que ocurren ANTES de que main.js se suscriba ya no se pierden:
 *     al suscribirse se repite el último estado conocido (conexión o aviso).
 */

class RedJuego {
    constructor() {
        this.url = resolverUrlServidor();
        this.socket = null;
        this.id = null;
        this.codigo = null;
        this.jugador = null;
        this.conectado = false;
        this.estado = "iniciando"; // iniciando | cargando | conectando | conectado | error
        this.mensajeEstado = "Iniciando cliente de red...";
        this.ultimoEstado = { conexion: null, desconexion: null, aviso: null };
        this.suscriptores = {
            conexion: [],
            desconexion: [],
            sala: [],
            partida: [],
            aviso: []
        };

        this.cargarClienteSocketIo();
    }

    /**
     * Suscribe una función a un evento del cliente.
     *
     * Si el evento ya ocurrió antes de suscribirse (conexión o un aviso), se
     * repite inmediatamente para que la interfaz no se quede desactualizada.
     *
     * @param {string} evento "conexion", "desconexion", "sala", "partida", "aviso".
     * @param {Function} manejador Función a llamar.
     */
    al(evento, manejador) {
        if (!this.suscriptores[evento]) {
            return;
        }

        this.suscriptores[evento].push(manejador);

        if (this.ultimoEstado[evento]) {
            manejador(this.ultimoEstado[evento]);
        }
    }

    /**
     * Lanza una notificación interna a los suscriptores.
     *
     * @param {string} evento Nombre del evento.
     * @param {*} datos Datos del evento.
     */
    avisar(evento, datos) {
        if (Object.prototype.hasOwnProperty.call(this.ultimoEstado, evento)) {
            this.ultimoEstado[evento] = datos;
        }

        (this.suscriptores[evento] || []).forEach((manejador) => {
            try {
                manejador(datos);
            } catch (error) {
                console.error(`[RED] Error en el manejador de "${evento}":`, error);
            }
        });
    }

    /**
     * Mensaje de diagnóstico de red (son pocos y siempre útiles).
     *
     * @param {string} mensaje Texto a mostrar.
     */
    depurar(mensaje) {
        console.log(`[RED] ${mensaje}`);
    }

    /**
     * Descarga e inicializa el cliente de Socket.IO servido por el servidor.
     *
     * Se prueban varias direcciones para que funcione igual en local, en red
     * local o en Internet (y con el cliente servido por Vite o por Express).
     */
    cargarClienteSocketIo() {
        this.estado = "cargando";
        this.mensajeEstado = `Cargando cliente de red desde ${this.url}...`;

        const candidatos = [
            `${this.url}/socket.io/socket.io.js`,
            "/socket.io/socket.io.js",
            "https://cdn.socket.io/4.8.1/socket.io.min.js"
        ];

        const intentar = (indice) => {
            if (typeof window.io === "function") {
                this.conectar();
                return;
            }

            if (indice >= candidatos.length) {
                this.estado = "error";
                this.mensajeEstado = `No se pudo cargar Socket.IO desde ${this.url}. ¿Está el servidor encendido?`;

                console.error(`[RED] ERROR: no se pudo cargar socket.io.js desde ${this.url}`);
                this.avisar("aviso", {
                    tipo: "error",
                    mensaje: `No se pudo conectar con el servidor (${this.url}). Inícialo con "npm run server".`
                });
                return;
            }

            const script = document.createElement("script");
            script.src = candidatos[indice];
            script.async = true;
            script.addEventListener("load", () => intentar(indice + 1));
            script.addEventListener("error", () => {
                this.depurar(`No se pudo cargar ${candidatos[indice]}; probando la siguiente dirección...`);
                intentar(indice + 1);
            });
            document.head.appendChild(script);
        };

        this.depurar(`Servidor configurado: ${this.url}`);
        intentar(0);
    }

    /**
     * Abre la conexión con el servidor.
     */
    conectar() {
        if (this.socket) {
            return;
        }

        this.estado = "conectando";
        this.mensajeEstado = `Conectando con ${this.url}...`;
        this.depurar(`Conectando con ${this.url}...`);

        this.socket = window.io(this.url, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 800,
            timeout: 8000
        });

        this.socket.on("connect", () => {
            this.conectado = true;
            this.estado = "conectado";
            this.id = this.socket.id;
            this.mensajeEstado = `Servidor conectado (${this.url}).`;
            this.depurar(`Conectado con el servidor. Id: ${this.id}`);
            this.avisar("conexion", { id: this.id, url: this.url });
        });

        this.socket.on("conexion:identidad", (datos) => {
            this.id = datos.id;
        });

        this.socket.on("connect_error", (error) => {
            this.conectado = false;
            this.estado = "error";
            this.mensajeEstado = `No se pudo conectar con ${this.url} (${error.message}).`;
            console.error(`[RED] ERROR de conexión: ${error.message}. Comprueba que el servidor esté encendido en ${this.url} (npm run server).`);

            this.avisar("aviso", {
                tipo: "error",
                mensaje: `Sin conexión con el servidor (${this.url}). Ejecuta "npm run server" y vuelve a intentarlo.`
            });
        });

        this.socket.on("connect_timeout", () => {
            this.conectado = false;
            this.estado = "error";
            this.mensajeEstado = `El servidor ${this.url} no respondió a tiempo.`;
            console.error(`[RED] ERROR: tiempo de espera agotado al conectar con ${this.url}`);
        });

        this.socket.on("reconnect_attempt", (intento) => {
            this.depurar(`Reintentando conexión (intento ${intento})...`);
        });

        this.socket.on("disconnect", (motivo) => {
            this.conectado = false;
            this.estado = "error";
            this.mensajeEstado = `Conexión perdida con el servidor (${motivo}).`;
            this.depurar(`Desconectado del servidor (${motivo}).`);
            this.avisar("desconexion", { motivo });
        });

        this.socket.on("sala:estado", (paquete) => {
            this.codigo = paquete.codigo;
            this.avisar("sala", paquete);
        });

        this.socket.on("partida:estado", (paquete) => {
            this.avisar("partida", paquete);
        });

        this.socket.on("aviso", (datos) => {
            this.avisar("aviso", datos);
        });
    }

    /**
     * Espera a que la conexión esté lista.
     *
     * Resuelve true si ya hay conexión y false si se agota el tiempo.
     * Es la pieza que hace que "CREAR SALA" funcione aunque se pulse nada más
     * abrir la página (antes respondía "todavía no hay conexión").
     *
     * @param {number} milisegundos Tiempo máximo de espera.
     * @returns {Promise<boolean>}
     */
    esperarConexion(milisegundos = 8000) {
        if (this.conectado && this.socket) {
            return Promise.resolve(true);
        }

        return new Promise((resolver) => {
            const inicio = Date.now();

            const revisar = () => {
                if (this.conectado && this.socket) {
                    resolver(true);
                    return;
                }

                if (Date.now() - inicio >= milisegundos) {
                    this.depurar("Se agotó el tiempo esperando la conexión con el servidor.");
                    resolver(false);
                    return;
                }

                setTimeout(revisar, 150);
            };

            revisar();
        });
    }

    /**
     * Envía un evento con respuesta, esperando antes a la conexión.
     *
     * @param {string} evento Nombre del evento.
     * @param {object} datos Datos a enviar.
     * @param {number} espera Tiempo máximo de espera de conexión.
     * @returns {Promise<object>} Respuesta del servidor.
     */
    async enviarConRespuesta(evento, datos, espera = 8000) {
        const listo = await this.esperarConexion(espera);

        if (!listo || !this.socket) {
            return {
                ok: false,
                mensaje: `Sin conexión con el servidor (${this.url}). Asegúrate de que esté encendido con "npm run server".`
            };
        }

        return new Promise((resolver) => {
            // Si el servidor no responde en 6 s, se avisa en vez de colgarse.
            const temporizador = setTimeout(() => {
                resolver({ ok: false, mensaje: "El servidor no respondió. Inténtalo otra vez." });
            }, 6000);

            this.depurar(`Enviando "${evento}" al servidor...`);

            this.socket.emit(evento, datos, (respuesta) => {
                clearTimeout(temporizador);
                this.depurar(`Respuesta de "${evento}": ${JSON.stringify(respuesta)}`);
                resolver(respuesta || { ok: true });
            });
        });
    }

    /**
     * Guarda la identidad del jugador devuelta por el servidor.
     *
     * @param {object} respuesta Respuesta de entrada a la sala.
     * @returns {object} Respuesta original.
     */
    registrarEntrada(respuesta) {
        if (respuesta && respuesta.ok) {
            this.codigo = respuesta.codigo;
            this.jugador = respuesta.jugador;
            this.id = respuesta.jugador.id;
        }

        return respuesta;
    }

    /**
     * Envía un evento al servidor sin esperar respuesta.
     *
     * @param {string} evento Nombre del evento.
     * @param {*} datos Datos.
     * @param {Function} respuesta Callback opcional.
     */
    emitir(evento, datos, respuesta = null) {
        if (!this.socket || !this.conectado) {
            this.depurar(`No se envió "${evento}": todavía no hay conexión.`);

            if (respuesta) {
                respuesta({ ok: false, mensaje: "Todavía no hay conexión con el servidor." });
            }

            return;
        }

        this.socket.emit(evento, datos, respuesta);
    }

    /* --- Acciones de sala ------------------------------------------------ */

    /**
     * Juego rápido: entra en la primera sala con hueco (o crea una).
     *
     * @param {string} nombre Nombre del jugador.
     */
    async entrarRapido(nombre) {
        return this.registrarEntrada(await this.enviarConRespuesta("sala:rapida", { nombre }));
    }

    /**
     * Crea una sala nueva. El jugador que la crea es el anfitrión.
     *
     * @param {string} nombre Nombre del jugador.
     */
    async crearSala(nombre) {
        return this.registrarEntrada(await this.enviarConRespuesta("sala:crear", { nombre }));
    }

    /**
     * Entra en una sala con código.
     *
     * @param {string} nombre Nombre del jugador.
     * @param {string} codigo Código de la sala.
     */
    async unirSala(nombre, codigo) {
        return this.registrarEntrada(await this.enviarConRespuesta("sala:unir", { nombre, codigo }));
    }

    /** Abandona la sala actual. */
    salirSala() {
        this.codigo = null;
        this.jugador = null;
        this.emitir("sala:salir", null, null);
    }

    /** Marca al jugador como listo o no listo. */
    marcarListo(listo) {
        this.emitir("sala:listo", { listo }, null);
    }

    /** Pide cambiar de personaje. */
    elegirPersonaje(personaje) {
        this.emitir("sala:personaje", { personaje }, null);
    }

    /** Pide iniciar la partida. */
    async iniciarPartida() {
        return this.enviarConRespuesta("partida:iniciar", null);
    }

    /** Pide una revancha. */
    async reiniciarPartida() {
        return this.enviarConRespuesta("partida:reiniciar", null);
    }

    /* --- Acciones de juego ---------------------------------------------- */

    /** Envía movimiento, salto y ángulo. */
    entrada(datos) {
        this.emitir("jugador:entrada", datos, null);
    }

    /** Comunica si se mantiene o se suelta el clic de carga. */
    cargar(activo) {
        this.emitir("jugador:cargar", Boolean(activo), null);
    }

    /** Dispara (el servidor decide si es válido). */
    disparar() {
        this.emitir("jugador:disparar", null, null);
    }
}

window.redJuego = new RedJuego();

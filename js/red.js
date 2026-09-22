/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - CAPA DE RED
 * =========================================================
 *
 * Socket.IO + configuración compatible con:
 *
 * DESARROLLO:
 *   Vite:     http://localhost:5173
 *   Servidor: http://localhost:3210
 *
 * PRODUCCIÓN / AWS:
 *   El juego y Socket.IO utilizan el mismo origen.
 *
 * Ejemplo:
 *   http://100.62.100.176:3210
 *
 * IMPORTANTE:
 * - No utiliza el puerto antiguo 3001.
 * - No depende de una IP local fija.
 * - Permite cambiar de localhost a AWS automáticamente.
 * - Mantiene reconexión automática.
 * - Mantiene WebSocket + polling.
 * =========================================================
 */


/**
 * =========================================================
 * RESOLVER URL DEL SERVIDOR
 * =========================================================
 *
 * Decide automáticamente a qué servidor debe conectarse
 * el cliente.
 *
 * Desarrollo con Vite:
 *
 *   http://localhost:5173
 *              ↓
 *   http://localhost:3210
 *
 * Producción:
 *
 *   http://IP-AWS:3210
 *              ↓
 *   http://IP-AWS:3210
 *
 * De esta forma no necesitamos modificar manualmente
 * localhost, IP privada o IP pública cada vez.
 */
function resolverUrlServidorRed() {

    const protocolo = window.location.protocol;
    const host = window.location.hostname;
    const puerto = window.location.port;

    /**
     * -----------------------------------------------------
     * DESARROLLO CON VITE
     * -----------------------------------------------------
     *
     * Vite normalmente utiliza el puerto 5173.
     *
     * En este caso el frontend está en:
     *
     * http://localhost:5173
     *
     * y Socket.IO está en:
     *
     * http://localhost:3210
     */
    if (puerto === "5173") {

        const servidorLocal = `${protocolo}//${host}:3210`;

        console.log(
            `[RED] Modo desarrollo Vite detectado. Servidor: ${servidorLocal}`
        );

        return servidorLocal;
    }


    /**
     * -----------------------------------------------------
     * DESARROLLO ALTERNATIVO
     * -----------------------------------------------------
     *
     * Si se accede desde otra interfaz local, por ejemplo:
     *
     * http://192.168.1.59:5173
     *
     * también utilizaremos el puerto 3210.
     *
     * Esto permitirá probar el juego desde otro equipo
     * conectado a la misma red.
     */
    if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.startsWith("172.")
    ) {

        const servidorLocal = `${protocolo}//${host}:3210`;

        console.log(
            `[RED] Servidor local/red detectado: ${servidorLocal}`
        );

        return servidorLocal;
    }


    /**
     * -----------------------------------------------------
     * PRODUCCIÓN / AWS
     * -----------------------------------------------------
     *
     * Cuando el servidor Node sirve directamente el juego,
     * utilizamos el mismo origen.
     *
     * Ejemplo:
     *
     * http://100.62.100.176:3210
     *
     * window.location.origin devuelve:
     *
     * http://100.62.100.176:3210
     *
     * Esto evita poner una IP pública fija dentro del código.
     */
    const servidorProduccion = window.location.origin;

    console.log(
        `[RED] Modo producción detectado. Servidor: ${servidorProduccion}`
    );

    return servidorProduccion;
}


/**
 * URL definitiva utilizada por el cliente.
 *
 * IMPORTANTE:
 * No utilizar:
 *
 * localhost:3001
 *
 * El servidor actual utiliza:
 *
 * localhost:3210
 */
const URL_SERVIDOR_JUEGO = resolverUrlServidorRed();

console.log(
    `[RED] URL definitiva del servidor: ${URL_SERVIDOR_JUEGO}`
);


/**
 * =========================================================
 * CLASE PRINCIPAL DE RED
 * =========================================================
 */
class RedJuego {

    constructor() {

        /**
         * URL calculada automáticamente.
         */
        this.url = URL_SERVIDOR_JUEGO;

        /**
         * Socket.IO.
         */
        this.socket = null;

        /**
         * Identidad del jugador.
         */
        this.id = null;

        /**
         * Código de sala.
         */
        this.codigo = null;

        /**
         * Datos del jugador.
         */
        this.jugador = null;

        /**
         * Configuración del chat que publica el servidor al conectarse
         * (límite de caracteres, mensajes por segundo...). El cliente NO tiene
         * una copia propia de esos números: los lee de aquí.
         */
        this.chatConfig = null;

        /**
         * Estado de conexión.
         */
        this.conectado = false;

        /**
         * Estados posibles:
         *
         * iniciando
         * cargando
         * conectando
         * conectado
         * error
         */
        this.estado = "iniciando";

        this.mensajeEstado = "Iniciando cliente de red...";

        /**
         * Guarda los últimos eventos importantes.
         */
        this.ultimoEstado = {
            conexion: null,
            desconexion: null,
            aviso: null
        };

        /**
         * Suscriptores de eventos.
         */
        this.suscriptores = {
            conexion: [],
            desconexion: [],
            sala: [],
            partida: [],
            aviso: [],
            // Chat de la sala: mensajes recibidos ("chat") y configuración
            // publicada por el servidor ("chatConfig").
            chat: [],
            chatConfig: []
        };

        /**
         * Cargar Socket.IO.
         */
        this.cargarClienteSocketIo();
    }


    /**
     * =====================================================
     * SUSCRIPCIÓN A EVENTOS
     * =====================================================
     */
    al(evento, manejador) {

        if (!this.suscriptores[evento]) {
            return;
        }

        this.suscriptores[evento].push(manejador);

        /**
         * Si ya ocurrió el evento anteriormente,
         * enviamos inmediatamente el último estado.
         */
        if (this.ultimoEstado[evento]) {

            manejador(
                this.ultimoEstado[evento]
            );
        }
    }


    /**
     * =====================================================
     * NOTIFICAR EVENTOS
     * =====================================================
     */
    avisar(evento, datos) {

        if (
            Object.prototype.hasOwnProperty.call(
                this.ultimoEstado,
                evento
            )
        ) {

            this.ultimoEstado[evento] = datos;
        }

        (
            this.suscriptores[evento] || []
        ).forEach((manejador) => {

            try {

                manejador(datos);

            } catch (error) {

                console.error(
                    `[RED] Error en manejador "${evento}":`,
                    error
                );
            }
        });
    }


    /**
     * =====================================================
     * DIAGNÓSTICO
     * =====================================================
     */
    depurar(mensaje) {

        console.log(
            `[RED] ${mensaje}`
        );
    }


    /**
     * =====================================================
     * CARGAR SOCKET.IO
     * =====================================================
     */
    cargarClienteSocketIo() {

        this.estado = "cargando";

        this.mensajeEstado =
            `Cargando Socket.IO desde ${this.url}...`;


        /**
         * Direcciones que se intentarán en orden.
         *
         * PRIMERA:
         * servidor actual.
         *
         * SEGUNDA:
         * servidor relativo.
         *
         * TERCERA:
         * CDN.
         */
        const candidatos = [

            `${this.url}/socket.io/socket.io.js`,

            "/socket.io/socket.io.js",

            "https://cdn.socket.io/4.8.1/socket.io.min.js"
        ];


        const intentar = (indice) => {

            /**
             * Si Socket.IO ya fue cargado,
             * conectar inmediatamente.
             */
            if (
                typeof window.io === "function"
            ) {

                this.conectar();

                return;
            }


            /**
             * No quedan candidatos.
             */
            if (
                indice >= candidatos.length
            ) {

                this.estado = "error";

                this.mensajeEstado =
                    `No se pudo cargar Socket.IO desde ${this.url}.`;


                console.error(
                    `[RED] ERROR: no se pudo cargar Socket.IO.`
                );


                this.avisar(
                    "aviso",
                    {
                        tipo: "error",
                        mensaje:
                            `No se pudo conectar con el servidor ${this.url}.`
                    }
                );

                return;
            }


            /**
             * Crear script dinámicamente.
             */
            const script =
                document.createElement("script");


            script.src =
                candidatos[indice];

            script.async = true;


            /**
             * Cargó correctamente.
             */
            script.addEventListener(
                "load",
                () => {

                    this.depurar(
                        `Socket.IO cargado desde ${candidatos[indice]}`
                    );

                    intentar(indice + 1);
                }
            );


            /**
             * Falló.
             */
            script.addEventListener(
                "error",
                () => {

                    this.depurar(
                        `No se pudo cargar ${candidatos[indice]}.`
                    );

                    intentar(indice + 1);
                }
            );


            document.head.appendChild(script);
        };


        this.depurar(
            `Servidor configurado: ${this.url}`
        );


        intentar(0);
    }


    /**
     * =====================================================
     * CONECTAR AL SERVIDOR
     * =====================================================
     */
    conectar() {

        /**
         * Evitar conexiones duplicadas.
         */
        if (this.socket) {

            return;
        }


        this.estado = "conectando";

        this.mensajeEstado =
            `Conectando con ${this.url}...`;


        this.depurar(
            `Conectando con ${this.url}...`
        );


        /**
         * Crear conexión Socket.IO.
         */
        this.socket = window.io(
            this.url,
            {

                transports: [
                    "websocket",
                    "polling"
                ],

                reconnection: true,

                reconnectionAttempts: 10,

                reconnectionDelay: 800,

                timeout: 8000
            }
        );


        /**
         * =================================================
         * CONEXIÓN EXITOSA
         * =================================================
         */
        this.socket.on(
            "connect",
            () => {

                this.conectado = true;

                this.estado = "conectado";

                this.id =
                    this.socket.id;

                this.mensajeEstado =
                    `Servidor conectado (${this.url}).`;


                this.depurar(
                    `Conectado al servidor. ID: ${this.id}`
                );


                this.avisar(
                    "conexion",
                    {
                        id: this.id,
                        url: this.url
                    }
                );
            }
        );


        /**
         * =================================================
         * IDENTIDAD
         * =================================================
         */
        this.socket.on(
            "conexion:identidad",
            (datos) => {

                if (datos && datos.id) {

                    this.id =
                        datos.id;
                }


                /**
                 * El servidor publica aquí los límites del chat
                 * (servidor/config.js): el cliente los aplica al campo de
                 * texto en lugar de tener una segunda copia de los números.
                 */
                if (datos && datos.chat) {

                    this.chatConfig =
                        datos.chat;


                    this.avisar(
                        "chatConfig",
                        datos.chat
                    );
                }
            }
        );


        /**
         * =================================================
         * ERROR DE CONEXIÓN
         * =================================================
         */
        this.socket.on(
            "connect_error",
            (error) => {

                this.conectado = false;

                this.estado = "error";


                this.mensajeEstado =
                    `No se pudo conectar con ${this.url} (${error.message}).`;


                console.error(
                    `[RED] ERROR de conexión: ${error.message}`
                );


                console.error(
                    `[RED] Servidor esperado: ${this.url}`
                );


                this.avisar(
                    "aviso",
                    {
                        tipo: "error",
                        mensaje:
                            `No se pudo conectar con ${this.url}.`
                    }
                );
            }
        );


        /**
         * =================================================
         * TIMEOUT
         * =================================================
         */
        this.socket.on(
            "connect_timeout",
            () => {

                this.conectado = false;

                this.estado = "error";


                this.mensajeEstado =
                    `El servidor ${this.url} no respondió a tiempo.`;


                console.error(
                    `[RED] Tiempo de espera agotado: ${this.url}`
                );
            }
        );


        /**
         * =================================================
         * RECONEXIÓN
         * =================================================
         */
        this.socket.on(
            "reconnect_attempt",
            (intento) => {

                this.depurar(
                    `Reintentando conexión. Intento ${intento}...`
                );
            }
        );


        /**
         * =================================================
         * DESCONEXIÓN
         * =================================================
         */
        this.socket.on(
            "disconnect",
            (motivo) => {

                this.conectado = false;

                this.estado = "error";


                this.mensajeEstado =
                    `Conexión perdida (${motivo}).`;


                this.depurar(
                    `Desconectado del servidor (${motivo}).`
                );


                this.avisar(
                    "desconexion",
                    {
                        motivo
                    }
                );
            }
        );


        /**
         * =================================================
         * ESTADO DE SALA
         * =================================================
         */
        this.socket.on(
            "sala:estado",
            (paquete) => {

                if (!paquete) {
                    return;
                }


                this.codigo =
                    paquete.codigo;


                this.avisar(
                    "sala",
                    paquete
                );
            }
        );


        /**
         * =================================================
         * ESTADO DE PARTIDA
         * =================================================
         */
        this.socket.on(
            "partida:estado",
            (paquete) => {

                this.avisar(
                    "partida",
                    paquete
                );
            }
        );


        /**
         * =================================================
         * CHAT DE LA SALA
         * =================================================
         *
         * El servidor solo envía los mensajes de la MISMA sala, así que aquí
         * no hay nada que filtrar: se entrega tal cual a js/chat.js. El chat
         * es independiente del juego (turnos, disparos, daño...).
         */
        this.socket.on(
            "chat:mensaje",
            (datos) => {

                if (
                    !datos ||
                    typeof datos.texto !== "string"
                ) {

                    return;
                }


                this.avisar(
                    "chat",
                    datos
                );
            }
        );


        /**
         * =================================================
         * AVISOS DEL SERVIDOR
         * =================================================
         */
        this.socket.on(
            "aviso",
            (datos) => {

                this.avisar(
                    "aviso",
                    datos
                );
            }
        );
    }


    /**
     * =====================================================
     * ESPERAR CONEXIÓN
     * =====================================================
     */
    esperarConexion(
        milisegundos = 8000
    ) {

        if (
            this.conectado &&
            this.socket
        ) {

            return Promise.resolve(true);
        }


        return new Promise(
            (resolver) => {

                const inicio =
                    Date.now();


                const revisar = () => {

                    if (
                        this.conectado &&
                        this.socket
                    ) {

                        resolver(true);

                        return;
                    }


                    if (
                        Date.now() - inicio >=
                        milisegundos
                    ) {

                        this.depurar(
                            "Se agotó el tiempo esperando la conexión."
                        );


                        resolver(false);

                        return;
                    }


                    setTimeout(
                        revisar,
                        150
                    );
                };


                revisar();
            }
        );
    }


    /**
     * =====================================================
     * ENVIAR CON RESPUESTA
     * =====================================================
     */
    async enviarConRespuesta(
        evento,
        datos,
        espera = 8000
    ) {

        const listo =
            await this.esperarConexion(
                espera
            );


        if (
            !listo ||
            !this.socket
        ) {

            return {

                ok: false,

                mensaje:
                    `Sin conexión con el servidor (${this.url}).`
            };
        }


        return new Promise(
            (resolver) => {

                const temporizador =
                    setTimeout(
                        () => {

                            resolver({

                                ok: false,

                                mensaje:
                                    "El servidor no respondió. Inténtalo otra vez."
                            });

                        },
                        6000
                    );


                this.depurar(
                    `Enviando "${evento}" al servidor...`
                );


                this.socket.emit(
                    evento,
                    datos,
                    (respuesta) => {

                        clearTimeout(
                            temporizador
                        );


                        this.depurar(
                            `Respuesta de "${evento}": ${JSON.stringify(respuesta)}`
                        );


                        resolver(
                            respuesta || {
                                ok: true
                            }
                        );
                    }
                );
            }
        );
    }


    /**
     * =====================================================
     * REGISTRAR ENTRADA
     * =====================================================
     */
    registrarEntrada(
        respuesta
    ) {

        if (
            respuesta &&
            respuesta.ok
        ) {

            this.codigo =
                respuesta.codigo;


            this.jugador =
                respuesta.jugador;


            if (respuesta.jugador) {

                this.id =
                    respuesta.jugador.id;
            }
        }


        return respuesta;
    }


    /**
     * =====================================================
     * ENTRAR RÁPIDO
     * =====================================================
     */
    async entrarRapido(
        nombre
    ) {

        return this.registrarEntrada(

            await this.enviarConRespuesta(
                "sala:rapida",
                {
                    nombre
                }
            )
        );
    }


    /**
     * =====================================================
     * CREAR SALA
     * =====================================================
     */
    async crearSala(
        nombre
    ) {

        return this.registrarEntrada(

            await this.enviarConRespuesta(
                "sala:crear",
                {
                    nombre
                }
            )
        );
    }


    /**
     * =====================================================
     * UNIRSE A SALA
     * =====================================================
     */
    async unirSala(
        nombre,
        codigo
    ) {

        return this.registrarEntrada(

            await this.enviarConRespuesta(
                "sala:unir",
                {
                    nombre,
                    codigo
                }
            )
        );
    }


    /**
     * =====================================================
     * SALIR DE SALA
     * =====================================================
     */
    salirSala() {

        this.codigo = null;

        this.jugador = null;


        this.emitir(
            "sala:salir",
            null,
            null
        );
    }


    /**
     * =====================================================
     * MARCAR LISTO
     * =====================================================
     */
    marcarListo(
        listo
    ) {

        this.emitir(
            "sala:listo",
            {
                listo
            },
            null
        );
    }


    /**
     * =====================================================
     * ELEGIR PERSONAJE
     * =====================================================
     */
    elegirPersonaje(
        personaje
    ) {

        this.emitir(
            "sala:personaje",
            {
                personaje
            },
            null
        );
    }


    /**
     * =====================================================
     * INICIAR PARTIDA
     * =====================================================
     */
    async iniciarPartida() {

        return this.enviarConRespuesta(
            "partida:iniciar",
            null
        );
    }


    /**
     * =====================================================
     * REINICIAR PARTIDA
     * =====================================================
     */
    async reiniciarPartida() {

        return this.enviarConRespuesta(
            "partida:reiniciar",
            null
        );
    }


    /**
     * =====================================================
     * ENTRADA DEL JUGADOR
     * =====================================================
     */
    entrada(
        datos
    ) {

        this.emitir(
            "jugador:entrada",
            datos,
            null
        );
    }


    /**
     * =====================================================
     * CARGAR DISPARO
     * =====================================================
     */
    cargar(
        activo
    ) {

        this.emitir(
            "jugador:cargar",
            Boolean(activo),
            null
        );
    }


    /**
     * =====================================================
     * DISPARAR
     * =====================================================
    */
    disparar() {

        this.emitir(
            "jugador:disparar",
            null,
            null
        );
    }


    /**
     * =====================================================
     * CHAT: ENVIAR MENSAJE A LA SALA
     * =====================================================
     *
     * Solo se manda el texto: el servidor lo limpia, lo recorta al máximo, y
     * le pone el nombre y el color del jugador (nunca el cliente). La
     * respuesta es opcional y sirve para avisar si el mensaje se descartó
     * (vacío, demasiado rápido...).
     */
    enviarChat(
        texto,
        respuesta = null
    ) {

        this.emitir(
            "chat:enviar",
            {
                texto
            },
            respuesta
        );
    }


    /**
     * =====================================================
     * EMITIR EVENTO
     * =====================================================
     */
    emitir(
        evento,
        datos,
        respuesta = null
    ) {

        if (
            !this.socket ||
            !this.conectado
        ) {

            this.depurar(
                `No se envió "${evento}": todavía no hay conexión.`
            );


            if (respuesta) {

                respuesta({

                    ok: false,

                    mensaje:
                        "Todavía no hay conexión con el servidor."
                });
            }


            return;
        }


        this.socket.emit(
            evento,
            datos,
            respuesta
        );
    }
}


/**
 * =========================================================
 * INSTANCIA GLOBAL
 * =========================================================
 *
 * El resto del proyecto utiliza:
 *
 * window.redJuego
 *
 * Por eso mantenemos exactamente ese nombre.
 */
window.redJuego =
    new RedJuego();


/**
 * =========================================================
 * INFORMACIÓN DE DIAGNÓSTICO
 * =========================================================
 */
console.log(
    "========================================================="
);

console.log(
    "[RED] Sistema de red de Pollitos al Ataque Online"
);

console.log(
    `[RED] Servidor seleccionado: ${URL_SERVIDOR_JUEGO}`
);

console.log(
    `[RED] Puerto de desarrollo: 3210`
);

console.log(
    "[RED] Configuración preparada para AWS"
);

console.log(
    "========================================================="
);
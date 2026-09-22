/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Servidor de juego
 * =========================================================
 *
 * Servidor autoritativo de partidas multijugador (hasta 6 jugadores por
 * sala) construido con Node.js + Express + Socket.IO.
 *
 * - Express sirve el cliente (index.html, css, js y assets) en el mismo
 *   puerto, de modo que en producción basta con abrir el puerto del servidor.
 *   En desarrollo se puede usar Vite (`npm run dev`) y el cliente se conecta
 *   automáticamente a este puerto.
 * - Socket.IO transporta las acciones de los jugadores y los estados.
 * - Toda la verdad del juego está en las salas (servidor/sala.js) y en el
 *   motor autoritativo (servidor/partida.js). El cliente nunca decide daño,
 *   vida, muertes ni ganador.
 * - GET /api/sonidos publica el listado REAL de archivos de audio, para que el
 *   cliente encuentre cada sonido aunque su nombre no coincida con el esperado.
 */

const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");

const CONFIG = require("./config");
const Sala = require("./sala");
const { listarArchivosDeAudio } = require("./sonidos");

const PUERTO = Number(process.env.PORT) || 3210;
const ORIGENES = process.env.ORIGENES_PERMITIDOS || "*";
const RAIZ_CLIENTE = path.join(__dirname, "..");
const CARPETA_SONIDOS = path.join(RAIZ_CLIENTE, "assets", "sonidos");
const ALFABETO_SALA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor, {
    cors: { origin: ORIGENES, methods: ["GET", "POST"] },
    pingTimeout: 20000
});

app.use(express.static(RAIZ_CLIENTE));

/** Salas activas: código -> Sala */
const salas = new Map();

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */

/**
 * Genera un código de sala único de cuatro caracteres.
 *
 * @returns {string}
 */
function generarCodigo() {
    for (let intento = 0; intento < 500; intento++) {
        let codigo = "";

        for (let indice = 0; indice < 4; indice++) {
            codigo += ALFABETO_SALA[Math.floor(Math.random() * ALFABETO_SALA.length)];
        }

        if (!salas.has(codigo)) {
            return codigo;
        }
    }

    // Último recurso: garantiza que nunca se cuelga buscando un hueco.
    return `S${salas.size + 1}`;
}

/**
 * Crea una sala nueva y la registra.
 *
 * @returns {Sala}
 */
function crearSala() {
    const sala = new Sala(generarCodigo());
    salas.set(sala.codigo, sala);
    console.log(`[sala] creada ${sala.codigo} (salas activas: ${salas.size})`);
    return sala;
}

/**
 * Busca una sala pública con espacio en el lobby.
 *
 * @returns {Sala|null}
 */
function buscarSalaDisponible() {
    for (const sala of salas.values()) {
        if (sala.estado === "lobby" && !sala.lleno) {
            return sala;
        }
    }

    return null;
}

/**
 * Sala donde está un socket.
 *
 * @param {import("socket.io").Socket} socket
 * @returns {Sala|null}
 */
function salaDeSocket(socket) {
    const codigo = socket.data.codigo;

    if (codigo && salas.has(codigo)) {
        return salas.get(codigo);
    }

    return null;
}

/* ---------------------------------------------------------
   Chat de sala
   --------------------------------------------------------- */

/**
 * Color de identificación de un jugador en el chat.
 *
 * Depende del ESPACIO que ocupa en la sala (0..5), así que todos los
 * jugadores de la partida ven el mismo color para el mismo jugador. La tabla
 * de colores vive en servidor/config.js (única fuente de verdad).
 *
 * @param {number} indice Espacio del jugador en la sala.
 * @returns {{ nombre: string, color: string }} Rótulo y color CSS.
 */
function colorDeJugador(indice) {
    return CONFIG.COLORES_JUGADOR[Number(indice)] || CONFIG.COLORES_JUGADOR[0];
}

/**
 * Limpia y valida el texto de un mensaje de chat.
 *
 * El chat NUNCA se fía de lo que manda el cliente:
 *  - solo acepta cadenas de texto (cualquier otra cosa se descarta),
 *  - cambia los caracteres de control por espacios (un chat de una sola línea
 *    no debe recibir saltos de línea ni tabuladores),
 *  - quita los espacios sobrantes del principio y del final,
 *  - recorta al máximo configurado (CONFIG.CHAT_LONGITUD_MAXIMA),
 *  - devuelve "" si no queda nada (mensaje vacío o solo con espacios).
 *
 * El texto se retransmite TAL CUAL, sin interpretarlo: el cliente lo pinta
 * como texto plano (textContent), así que un mensaje con
 * <script>alert("hola")</script> se lee literalmente y no se ejecuta.
 *
 * @param {*} valor Texto recibido del cliente.
 * @returns {string} Texto listo para retransmitir, o "" si no es válido.
 */
function limpiarMensajeDeChat(valor) {
    if (typeof valor !== "string") {
        return "";
    }

    return valor
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, CONFIG.CHAT_LONGITUD_MAXIMA);
}

/* ---------------------------------------------------------
   API HTTP (diagnóstico, despliegue y sonidos)
   --------------------------------------------------------- */

app.get("/salud", (request, response) => {
    response.json({
        ok: true,
        salas: salas.size,
        jugadores: [...salas.values()].reduce((total, sala) => total + sala.cantidadJugadores, 0),
        version: "2.0.0-multijugador"
    });
});

app.get("/salas", (request, response) => {
    response.json([...salas.values()].map((sala) => ({
        codigo: sala.codigo,
        estado: sala.estado,
        jugadores: sala.cantidadJugadores,
        maxJugadores: CONFIG.MAX_JUGADORES
    })));
});

/**
 * Listado real de archivos de audio.
 *
 * El cliente lo usa para resolver los nombres verdaderos de cada sonido
 * (por ejemplo "explocion.mp3" o "fondo_de_munu_principal.mp3") en lugar de
 * pedir rutas que no existen y recibir 404.
 */
app.get("/api/sonidos", (request, response) => {
    const archivos = listarArchivosDeAudio(CARPETA_SONIDOS, ["mp3", "wav", "ogg", "m4a", "aac"]);

    // CORS abierto SOLO para este listado: el cliente puede servirse desde
    // otro origen (por ejemplo Vite en el puerto 5173).
    response.set("Access-Control-Allow-Origin", ORIGENES);
    response.json({
        ok: true,
        carpeta: "assets/sonidos/",
        extensiones: ["mp3", "wav", "ogg", "m4a", "aac"],
        total: archivos.length,
        archivos
    });
});

/* ---------------------------------------------------------
   Eventos de Socket.IO
   --------------------------------------------------------- */

io.on("connection", (socket) => {
    // Identidad del socket + configuración del chat. El límite de caracteres
    // viaja desde aquí para que el cliente no tenga una copia propia del
    // número que vive en servidor/config.js.
    socket.emit("conexion:identidad", {
        id: socket.id,
        chat: {
            longitudMaxima: CONFIG.CHAT_LONGITUD_MAXIMA,
            mensajesPorSegundo: CONFIG.CHAT_MENSAJES_POR_SEGUNDO
        }
    });
    console.log(`[red] cliente conectado ${socket.id}`);

    // Límite sencillo de acciones por segundo para no saturar la simulación.
    let accionesEnVentana = 0;
    let inicioVentana = Date.now();

    function puedeEnviarAccion() {
        const ahora = Date.now();

        if (ahora - inicioVentana > 1000) {
            inicioVentana = ahora;
            accionesEnVentana = 0;
        }

        accionesEnVentana += 1;
        return accionesEnVentana <= 90;
    }

    /** Crea una sala nueva y entra en ella (el jugador queda como anfitrión). */
    socket.on("sala:crear", (datos, responder) => {
        const sala = crearSala();
        const resultado = entrarEnSala(socket, sala, datos && datos.nombre);

        console.log(`[red] sala creada por ${socket.id} -> ${resultado.ok ? resultado.codigo : "rechazada"}`);
        responder?.(resultado);
    });

    /** Juego rápido: entra en la primera sala con hueco o crea una. */
    socket.on("sala:rapida", (datos, responder) => {
        const existente = buscarSalaDisponible();
        const sala = existente || crearSala();
        const resultado = entrarEnSala(socket, sala, datos && datos.nombre);

        console.log(`[red] partida rápida de ${socket.id} -> ${resultado.ok ? resultado.codigo : "rechazada"}${existente ? " (sala existente)" : " (sala nueva)"}`);
        responder?.(resultado);
    });

    /** Entra en una sala por código. */
    socket.on("sala:unir", (datos, responder) => {
        const codigo = String((datos && datos.codigo) || "").toUpperCase().trim().slice(0, 4);
        const sala = salas.get(codigo);

        if (!sala) {
            console.warn(`[red] ${socket.id} intentó unirse a "${codigo}" y esa sala no existe (activas: ${[...salas.keys()].join(", ") || "ninguna"})`);
            responder?.({
                ok: false,
                mensaje: `No existe ninguna sala con el código "${codigo}". Comprueba el código o crea una sala.`
            });
            return;
        }

        const resultado = entrarEnSala(socket, sala, datos && datos.nombre);

        console.log(`[red] ${socket.id} se unió a ${codigo} -> ${resultado.ok ? "ok" : resultado.mensaje}`);
        responder?.(resultado);
    });

    /** Salida voluntaria (botón "SALIR DE LA SALA" o "SALIR"). */
    socket.on("sala:salir", () => {
        salirDeSala(socket);
    });

    /** Marca al jugador como listo o no listo. */
    socket.on("sala:listo", (datos) => {
        const sala = salaDeSocket(socket);

        if (sala) {
            sala.marcarListo(socket.id, datos && datos.listo);
        }
    });

    /** Cambio de personaje dentro del lobby. */
    socket.on("sala:personaje", (datos) => {
        const sala = salaDeSocket(socket);

        if (!sala) {
            return;
        }

        const aplicado = sala.elegirPersonaje(socket.id, datos && datos.personaje);

        if (!aplicado) {
            socket.emit("aviso", { tipo: "error", mensaje: "Ese personaje ya está elegido." });
        }
    });

    /** Inicio de la partida. */
    socket.on("partida:iniciar", (datos, responder) => {
        const sala = salaDeSocket(socket);
        const resultado = sala ? sala.iniciar(socket.id) : { ok: false, mensaje: "No estás en ninguna sala." };
        responder?.(resultado);

        if (resultado.ok) {
            console.log(`[sala ${sala.codigo}] partida iniciada con ${sala.cantidadJugadores} jugadores`);
        } else {
            socket.emit("aviso", { tipo: "error", mensaje: resultado.mensaje });
        }
    });

    /** Revancha con los mismos jugadores. */
    socket.on("partida:reiniciar", (datos, responder) => {
        const sala = salaDeSocket(socket);
        const resultado = sala ? sala.reiniciar(socket.id) : { ok: false, mensaje: "No estás en ninguna sala." };
        responder?.(resultado);

        if (!resultado.ok) {
            socket.emit("aviso", { tipo: "error", mensaje: resultado.mensaje });
        }
    });

    /** Entrada de juego: movimiento, salto y ángulo. */
    socket.on("jugador:entrada", (datos) => {
        if (!puedeEnviarAccion()) {
            return;
        }

        salaDeSocket(socket)?.accion(socket.id, "entrada", datos);
    });

    /** Carga del cañón (clic presionado o soltado). */
    socket.on("jugador:cargar", (activo) => {
        if (!puedeEnviarAccion()) {
            return;
        }

        salaDeSocket(socket)?.accion(socket.id, "cargar", activo);
    });

    /** Disparo. El servidor comprueba turno, vida y que no se haya disparado ya. */
    socket.on("jugador:disparar", () => {
        if (!puedeEnviarAccion()) {
            return;
        }

        salaDeSocket(socket)?.accion(socket.id, "disparar");
    });

    /* -----------------------------------------------------
       CHAT DE SALA
       -----------------------------------------------------
       El chat usa la MISMA conexión Socket.IO de la partida (no hay
       socket, puerto ni servidor aparte) y el servidor retransmite cada
       mensaje SOLO a los jugadores de la sala del emisor: nadie de otra
       sala lo recibe.

       El chat no toca nada del juego: no cambia posiciones, vida, turnos,
       disparos ni temporizador. Es solo texto.
       ----------------------------------------------------- */

    // Límite de mensajes por segundo de ESTE jugador (evita el spam).
    let mensajesEnVentana = 0;
    let inicioVentanaChat = Date.now();

    /**
     * Comprueba si este jugador todavía puede enviar un mensaje ahora mismo.
     *
     * @returns {boolean}
     */
    function puedeEnviarMensaje() {
        const ahora = Date.now();

        if (ahora - inicioVentanaChat > 1000) {
            inicioVentanaChat = ahora;
            mensajesEnVentana = 0;
        }

        mensajesEnVentana += 1;
        return mensajesEnVentana <= CONFIG.CHAT_MENSAJES_POR_SEGUNDO;
    }

    /**
     * Mensaje de chat de un jugador para su propia sala.
     *
     * El cliente solo manda el TEXTO: el nombre, el personaje y el color los
     * pone el servidor a partir del jugador de la sala, así que nadie puede
     * hacerse pasar por otro ni inventarse colores.
     */
    socket.on("chat:enviar", (datos, responder) => {
        const sala = salaDeSocket(socket);
        const jugador = sala ? sala.jugadores.get(socket.id) : null;

        // 1. Solo puede escribir quien está en una sala.
        if (!sala || !jugador) {
            responder?.({ ok: false, mensaje: "No estás en ninguna sala." });
            return;
        }

        // 2. Texto limpio y no vacío (recortado al máximo permitido).
        const texto = limpiarMensajeDeChat(datos && datos.texto);

        if (!texto) {
            responder?.({ ok: false, mensaje: "El mensaje está vacío." });
            return;
        }

        // 3. Ritmo máximo por jugador.
        if (!puedeEnviarMensaje()) {
            responder?.({ ok: false, mensaje: "Vas demasiado rápido: espera un instante." });
            return;
        }

        const color = colorDeJugador(jugador.indice);
        const personaje = CONFIG.PERSONAJES[jugador.personaje] || CONFIG.PERSONAJES[0];

        const paquete = {
            tipo: "mensaje",
            autorId: socket.id,
            nombre: jugador.nombre,
            personaje: jugador.personaje,
            personajeNombre: personaje.nombre,
            color: color.color,
            colorNombre: color.nombre,
            texto,
            hora: Date.now()
        };

        // 4. SOLO a los jugadores de esta sala (io.to es la sala de Socket.IO).
        io.to(sala.codigo).emit("chat:mensaje", paquete);

        sala.ultimaActividad = Date.now();
        console.log(`[sala ${sala.codigo}] chat [${color.nombre}] ${jugador.nombre}: ${texto}`);
        responder?.({ ok: true, color: color.color, colorNombre: color.nombre });
    });

    /** Desconexión: se informa a la sala y la partida continúa sin él. */
    socket.on("disconnect", (motivo) => {
        const sala = salaDeSocket(socket);

        if (!sala) {
            console.log(`[red] cliente desconectado ${socket.id} (${motivo})`);
            return;
        }

        const jugador = sala.salir(socket.id);
        socket.data.codigo = null;

        if (jugador) {
            console.log(`[sala ${sala.codigo}] ${jugador.nombre} se desconectó (${motivo})`);
        }
    });
});

/* ---------------------------------------------------------
   Funciones de entrada y salida de salas
   (se usan desde los eventos de arriba: las funciones se elevan, así que el
   orden en el archivo no afecta al funcionamiento)
   --------------------------------------------------------- */

/**
 * Mete a un socket en una sala y devuelve la respuesta de la operación.
 *
 * Si el socket ya estaba en otra sala, primero se le saca de ella.
 *
 * @param {import("socket.io").Socket} socket
 * @param {Sala} sala
 * @param {string} nombre
 * @returns {object} Respuesta que se envía al cliente.
 */
function entrarEnSala(socket, sala, nombre) {
    salirDeSala(socket, false);

    const resultado = sala.unir(socket.id, nombre);

    if (!resultado.ok) {
        console.warn(`[sala ${sala.codigo}] entrada rechazada: ${resultado.mensaje}`);
        return resultado;
    }

    socket.join(sala.codigo);
    socket.data.codigo = sala.codigo;
    sala.ultimaActividad = Date.now();
    console.log(`[sala ${sala.codigo}] ${resultado.jugador.nombre} entró (${sala.cantidadJugadores}/${CONFIG.MAX_JUGADORES})`);

    // El color del jugador viaja con la respuesta para que el cliente pueda
    // mostrar de quién es cada mensaje del chat desde el primer momento.
    const color = colorDeJugador(resultado.jugador.indice);

    return {
        ok: true,
        codigo: sala.codigo,
        maxJugadores: CONFIG.MAX_JUGADORES,
        jugadores: sala.cantidadJugadores,
        jugador: {
            id: socket.id,
            nombre: resultado.jugador.nombre,
            personaje: resultado.jugador.personaje,
            indice: resultado.jugador.indice,
            color: color.color,
            colorNombre: color.nombre
        }
    };
}

/**
 * Saca a un socket de su sala actual.
 *
 * @param {import("socket.io").Socket} socket
 * @param {boolean} avisar Si es false se trata de un cambio de sala.
 */
function salirDeSala(socket, avisar = true) {
    const sala = salaDeSocket(socket);

    if (!sala) {
        return;
    }

    if (avisar) {
        const jugador = sala.salir(socket.id);

        if (jugador) {
            console.log(`[sala ${sala.codigo}] ${jugador.nombre} salió (${sala.cantidadJugadores}/${CONFIG.MAX_JUGADORES})`);
        }
    } else {
        // Cambio de sala: no se anuncia la desconexión.
        sala.jugadores.delete(socket.id);
        sala.lobbySucio = true;
    }

    socket.leave(sala.codigo);
    socket.data.codigo = null;

    if (sala.vacia) {
        sala.ultimaActividad = Date.now();
    }
}

/* ---------------------------------------------------------
   Bucle del servidor: simulación y emisión de estados
   --------------------------------------------------------- */

let ultimoTick = Date.now();

setInterval(() => {
    const ahora = Date.now();
    const transcurrido = ahora - ultimoTick;
    ultimoTick = ahora;

    salas.forEach((sala) => {
        sala.actualizar(transcurrido);

        const paqueteLobby = sala.tomarPaqueteLobby();

        if (paqueteLobby) {
            io.to(sala.codigo).emit("sala:estado", paqueteLobby);
        }

        const paquetePartida = sala.tomarPaquetePartida();

        if (paquetePartida) {
            io.to(sala.codigo).emit("partida:estado", paquetePartida);
        }
    });

    // Limpieza de salas abandonadas.
    salas.forEach((sala, codigo) => {
        if (!sala.vacia) {
            return;
        }

        const inactiva = (ahora - sala.ultimaActividad) / 1000;

        if (inactiva >= CONFIG.SEGUNDOS_SALA_VACIA) {
            salas.delete(codigo);
            console.log(`[sala] eliminada ${codigo} (salas activas: ${salas.size})`);
        }
    });
}, 1000 / 60);

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */

/**
 * Muestra por consola un error de arranque entendible.
 *
 * Antes, si el puerto estaba ocupado o bloqueado por el sistema, el proceso
 * terminaba con un error críptico (EADDRINUSE / EACCES) sin explicar nada.
 *
 * @param {NodeJS.ErrnoException} error Error del servidor.
 */
function explicarErrorDePuerto(error) {
    console.error("=========================================================");
    console.error("  NO SE PUDO INICIAR EL SERVIDOR");
    console.error("=========================================================");

    if (error.code === "EADDRINUSE") {
        console.error(`  El puerto ${PUERTO} ya está en uso.`);
        console.error("  Soluciones:");
        console.error("   - Cierra el otro programa que lo esté usando, o");
        console.error("   - Inicia el servidor en otro puerto:");
        console.error(`       Windows:  set PORT=3210 && npm run server`);
        console.error(`       Linux/Mac: PORT=3210 npm run server`);
    } else if (error.code === "EACCES") {
        console.error(`  El sistema no permite usar el puerto ${PUERTO} (permiso denegado).`);
        console.error("  Suele pasar cuando el puerto está reservado por Windows.");
        console.error(`  Inicia el servidor en otro puerto: set PORT=3210 && npm run server`);
    } else {
        console.error(`  ${error.message}`);
    }

    console.error("=========================================================");
}

servidor.on("error", explicarErrorDePuerto);

servidor.listen(PUERTO, () => {
    const archivosDeAudio = listarArchivosDeAudio(CARPETA_SONIDOS, ["mp3", "wav", "ogg", "m4a", "aac"]);

    console.log("=========================================================");
    console.log("  POLLITOS AL ATAQUE - SERVIDOR MULTIJUGADOR ONLINE");
    console.log("=========================================================");
    console.log(`  Cliente y API:   http://localhost:${PUERTO}`);
    console.log(`  Socket.IO:       http://localhost:${PUERTO}/socket.io`);
    console.log(`  Listado de audio: http://localhost:${PUERTO}/api/sonidos`);
    console.log(`  Sala máxima:     ${CONFIG.MAX_JUGADORES} jugadores`);
    console.log(`  Sonidos:         ${archivosDeAudio.length} archivos encontrados en assets/sonidos/`);

    if (!archivosDeAudio.length) {
        console.log("  Aviso: no hay archivos de audio. Revisa assets/sonidos/.");
    }

    console.log("---------------------------------------------------------");
    console.log("  Abre varias pestañas o navegadores para probar con");
    console.log("  2 o hasta 6 jugadores conectados a la misma partida.");
    console.log("=========================================================");
});


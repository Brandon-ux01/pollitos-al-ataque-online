/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Prueba real de salas (6 jugadores)
 * =========================================================
 *
 * Esta utilidad demuestra, con el servidor y el protocolo REALES, todo el
 * flujo multijugador:
 *
 *   1. Arranca el servidor en un puerto de prueba.
 *   2. Conecta 6 clientes Socket.IO de verdad (el mismo cliente que usa el
 *      navegador, cargado en Node).
 *   3. El jugador 1 pulsa "CREAR SALA"  -> comprueba que el servidor crea la
 *      sala, devuelve un CÓDIGO y el contador marca 1/6.
 *   4. Los jugadores 2..6 se unen con ese código -> 2/6, 3/6 ... 6/6.
 *   5. Todos se marcan listos e inician la partida -> reciben el mismo estado
 *      con 6 jugadores (sincronización).
 *   6. El jugador con el turno dispara -> TODOS reciben el evento de disparo
 *      (es lo que hace sonar el efecto de disparo en cada cliente).
 *   7. Se espera la explosión -> TODOS reciben el evento de explosión.
 *   8. Cinco jugadores se desconectan -> la partida termina y el cliente que
 *      queda recibe "fin-partida" (game over).
 *   9. Se comprueba que un jugador SIN turno no puede disparar, y que el
 *      jugador con turno puede dar el DOBLE SALTO (dos ESPACIO seguidos, los
 *      mismos que reciben los otros cinco clientes).
 *  10. CHAT DE SALA con la MISMA conexión Socket.IO: los 6 jugadores se
 *      escriben entre ellos, un jugador de OTRA sala no recibe nada, el
 *      servidor recorta a 100 caracteres, rechaza mensajes vacíos o que no son
 *      texto, frena el spam y el chat no altera la partida.
 *  11. Se apaga el servidor y se informa del resultado.
 *
 * Uso:
 *   npm run salas
 *   node utilidades/probar_salas.js
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const http = require("node:http");

const PUERTO = Number(process.env.PUERTO_PRUEBA) || 3391;
const RUTA_CLIENTE_SOCKETIO = path.join(__dirname, "..", "node_modules", "socket.io", "client-dist", "socket.io.js");

// Configuración del servidor (única fuente de verdad de las reglas y tiempos).
const CONFIG = require(path.join(__dirname, "..", "servidor", "config.js"));

const fallos = [];
let pruebas = 0;

/**
 * Comprueba una condición y la registra.
 *
 * @param {boolean} condicion Resultado.
 * @param {string} descripcion Texto de la prueba.
 */
function comprobar(condicion, descripcion) {
    pruebas += 1;

    if (condicion) {
        console.log(`  ok    ${descripcion}`);
    } else {
        fallos.push(descripcion);
        console.log(`  FALLA ${descripcion}`);
    }
}

/**
 * Carga el cliente Socket.IO del navegador dentro de Node.
 *
 * @returns {Function} Función io del cliente.
 */
function cargarClienteSocketIo() {
    const codigo = fs.readFileSync(RUTA_CLIENTE_SOCKETIO, "utf8");
    const contexto = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        queueMicrotask,
        URL,
        URLSearchParams,
        TextDecoder,
        TextEncoder,
        ArrayBuffer,
        Uint8Array,
        Promise,
        Map,
        Set,
        Error,
        Date,
        Math,
        JSON,
        Number,
        String,
        Object,
        Array,
        Boolean,
        RegExp,
        Symbol,
        WeakMap,
        WeakSet,
        encodeURIComponent,
        decodeURIComponent,
        performance,
        fetch: globalThis.fetch,
        WebSocket: globalThis.WebSocket,
        location: {
            origin: `http://localhost:${PUERTO}`,
            protocol: "http:",
            hostname: "localhost",
            port: String(PUERTO)
        }
    };

    contexto.window = contexto;
    contexto.self = contexto;
    contexto.globalThis = contexto;
    contexto.navigator = { userAgent: "node" };

    vm.createContext(contexto);
    vm.runInContext(codigo, contexto);

    return contexto.io;
}

/**
 * Espera a que el servidor responda en /salud.
 *
 * @param {number} intentos Intentos máximos.
 * @returns {Promise<boolean>}
 */
async function esperarServidor(intentos = 40) {
    for (let intento = 0; intento < intentos; intento++) {
        const listo = await new Promise((resolver) => {
            const peticion = http.get(`http://localhost:${PUERTO}/salud`, (respuesta) => {
                respuesta.resume();
                resolver(respuesta.statusCode === 200);
            });

            peticion.on("error", () => resolver(false));
            peticion.setTimeout(500, () => {
                peticion.destroy();
                resolver(false);
            });
        });

        if (listo) {
            return true;
        }

        await new Promise((resolver) => setTimeout(resolver, 250));
    }

    return false;
}

/**
 * Crea un cliente de prueba con ayudas para esperar eventos.
 *
 * @param {Function} io Cliente Socket.IO.
 * @param {string} nombre Nombre del jugador.
 * @returns {object} Cliente con utilidades.
 */
function crearCliente(io, nombre) {
    const socket = io(`http://localhost:${PUERTO}`, { transports: ["websocket"] });

    const cliente = {
        nombre,
        socket,
        id: null,
        codigo: null,
        lobby: null,
        jugadores: 0,
        estadosPartida: [],
        eventos: [],
        /** Mensajes de chat recibidos por este cliente. */
        chatMensajes: [],
        /** Configuración del chat publicada por el servidor al conectarse. */
        chatConfig: null
    };

    socket.on("connect", () => {
        cliente.id = socket.id;
    });

    socket.on("conexion:identidad", (datos) => {
        if (datos && datos.chat) {
            cliente.chatConfig = datos.chat;
        }
    });

    socket.on("chat:mensaje", (datos) => {
        cliente.chatMensajes.push(datos);
    });

    socket.on("sala:estado", (paquete) => {
        cliente.lobby = paquete;
        cliente.codigo = paquete.codigo;
        cliente.jugadores = (paquete.jugadores || []).length;
    });

    socket.on("partida:estado", (paquete) => {
        cliente.estadosPartida.push(paquete);
        cliente.eventos.push(...(paquete.eventos || []));
    });

    return cliente;
}

/**
 * Envía un evento con respuesta (como hace el cliente real).
 *
 * @param {object} cliente Cliente de prueba.
 * @param {string} evento Nombre del evento.
 * @param {object} datos Datos.
 * @returns {Promise<object>} Respuesta del servidor.
 */
function enviar(cliente, evento, datos) {
    return new Promise((resolver) => {
        const temporizador = setTimeout(() => resolver({ ok: false, mensaje: "sin respuesta" }), 5000);

        cliente.socket.emit(evento, datos, (respuesta) => {
            clearTimeout(temporizador);
            resolver(respuesta || { ok: true });
        });
    });
}

/**
 * Espera hasta que se cumpla una condición.
 *
 * @param {Function} condicion Función que devuelve true cuando ya se cumplió.
 * @param {number} milisegundos Tiempo máximo de espera.
 * @returns {Promise<boolean>}
 */
async function esperar(condicion, milisegundos = 6000) {
    const inicio = Date.now();

    while (Date.now() - inicio < milisegundos) {
        if (condicion()) {
            return true;
        }

        await new Promise((resolver) => setTimeout(resolver, 100));
    }

    return condicion();
}

/**
 * Pide el listado de sonidos del servidor.
 *
 * @returns {Promise<object|null>}
 */
function pedirListadoDeSonidos() {
    return new Promise((resolver) => {
        http.get(`http://localhost:${PUERTO}/api/sonidos`, (respuesta) => {
            let texto = "";

            respuesta.on("data", (parte) => {
                texto += parte;
            });

            respuesta.on("end", () => {
                try {
                    resolver(JSON.parse(texto));
                } catch (error) {
                    resolver(null);
                }
            });
        }).on("error", () => resolver(null));
    });
}

/* ---------------------------------------------------------
   Ejecución de la prueba
   --------------------------------------------------------- */

(async () => {
    console.log("");
    console.log("=========================================================");
    console.log("  PRUEBA REAL DE SALAS MULTIJUGADOR (6 JUGADORES)");
    console.log(`  Servidor de prueba en el puerto ${PUERTO}`);
    console.log("=========================================================");
    console.log("");

    const raiz = path.join(__dirname, "..");
    const servidor = spawn(process.execPath, [path.join(raiz, "servidor", "servidor.js")], {
        cwd: raiz,
        env: { ...process.env, PORT: String(PUERTO) },
        stdio: ["ignore", "pipe", "pipe"]
    });

    servidor.stdout.on("data", (datos) => {
        const texto = String(datos).trim().split("\n").join(" | ");

        if (texto.includes("[sala") || texto.includes("[red")) {
            console.log(`  (servidor) ${texto}`);
        }
    });

    const apagar = () => {
        try {
            servidor.kill();
        } catch (error) {
            // El proceso ya estaba cerrado.
        }
    };

    try {
        const arrancado = await esperarServidor();

        if (!arrancado) {
            console.error(`  No se pudo arrancar el servidor de prueba en el puerto ${PUERTO}.`);
            apagar();
            process.exitCode = 1;
            return;
        }

        console.log("  Servidor de prueba listo.");
        console.log("");

        /* --- Listado de sonidos (lo usa el cliente para hallar el audio) --- */
        console.log("== LISTADO DE SONIDOS DEL SERVIDOR ==");
        const listado = await pedirListadoDeSonidos();

        comprobar(Boolean(listado) && Array.isArray(listado.archivos), "GET /api/sonidos devuelve el listado de audio");
        comprobar(Boolean(listado) && listado.total >= 7,
            `el listado incluye los archivos de audio reales (${listado ? listado.total : 0} encontrados)`);

        if (listado && listado.archivos) {
            const rutas = listado.archivos.map((archivo) => archivo.ruta);

            comprobar(rutas.some((ruta) => ruta.includes("fondo_de_munu_principal")),
                "el listado detecta la música real del menú (nombre con errata)");
            comprobar(rutas.some((ruta) => ruta.includes("explocion")),
                "el listado detecta la explosión real (nombre con errata)");
            comprobar(rutas.some((ruta) => ruta.includes("disparo_de_ca")),
                "el listado detecta el disparo real (sin tilde)");
        }

        /* --- Conexión de los seis clientes y creación de sala --- */
        console.log("");
        console.log("== CONEXIÓN Y CREACIÓN DE SALA ==");
        const io = cargarClienteSocketIo();
        const clientes = [1, 2, 3, 4, 5, 6].map((numero) => crearCliente(io, `Brandon${numero}`));

        const conectados = await esperar(() => clientes.every((cliente) => cliente.id), 8000);
        comprobar(conectados, "los 6 clientes se conectan al servidor");

        const creada = await enviar(clientes[0], "sala:crear", { nombre: clientes[0].nombre });
        comprobar(creada.ok === true, "el jugador 1 crea la sala (respuesta ok)");
        comprobar(typeof creada.codigo === "string" && creada.codigo.length === 4,
            `el servidor genera un código de sala (${creada.codigo})`);
        comprobar(creada.jugadores === 1, "la respuesta indica 1/6 jugadores");

        const codigo = creada.codigo;
        const lobbyCreador = await esperar(() => clientes[0].lobby && clientes[0].lobby.codigo === codigo);
        comprobar(lobbyCreador, "el creador recibe el estado del lobby con el código");
        comprobar(clientes[0].jugadores === 1, "el lobby del creador marca JUGADORES 1/6");

        /* --- Los otros cinco se unen con el código --- */
        console.log("");
        console.log("== UNIÓN DE LOS DEMÁS JUGADORES ==");

        for (let indice = 1; indice < clientes.length; indice++) {
            const respuesta = await enviar(clientes[indice], "sala:unir", {
                nombre: clientes[indice].nombre,
                codigo
            });

            comprobar(respuesta.ok === true, `el jugador ${indice + 1} entra con el código ${codigo}`);
            comprobar(respuesta.jugadores === indice + 1, `el servidor responde ${indice + 1}/6 jugadores`);

            await esperar(() => clientes[0].jugadores === indice + 1, 3000);
        }

        const todosVenSeis = await esperar(() => clientes.every((cliente) => cliente.jugadores === 6), 4000);
        comprobar(todosVenSeis, "los 6 clientes ven JUGADORES 6/6 en su lobby");
        comprobar(clientes[5].lobby.jugadores.every((jugador) => jugador.nombre),
            "el lobby incluye el nombre de cada jugador");

        const inexistente = await enviar(clientes[5], "sala:unir", { nombre: "Fantasma", codigo: "ZZZZ" });
        comprobar(inexistente.ok === false, "un código inexistente se rechaza con un mensaje");

        /* --- Listos e inicio de partida --- */
        console.log("");
        console.log("== INICIO DE PARTIDA ==");

        clientes.forEach((cliente) => cliente.socket.emit("sala:listo", { listo: true }));

        const listos = await esperar(() => clientes[0].lobby && clientes[0].lobby.puedeIniciar, 4000);
        comprobar(listos, "con 6 jugadores listos la partida se puede iniciar");

        const inicio = await enviar(clientes[0], "partida:iniciar", null);
        comprobar(inicio.ok === true, "el servidor acepta iniciar la partida");

        const inicioRecibido = await esperar(() => clientes.every((cliente) =>
            cliente.estadosPartida.some((paquete) => paquete.tipo === "inicio")), 5000);
        comprobar(inicioRecibido, "los 6 clientes reciben el paquete inicial de la partida");

        const mundoComun = clientes.every((cliente) => {
            const paquete = cliente.estadosPartida.find((estado) => estado.tipo === "inicio");
            return Boolean(paquete) && paquete.jugadores.length === 6 &&
                paquete.mundo && paquete.mundo.plataformas.length > 0;
        });
        comprobar(mundoComun, "los 6 clientes reciben el mismo mundo con 6 jugadores (partida sincronizada)");

        const primerEstado = clientes[0].estadosPartida.find((paquete) => paquete.turno);
        comprobar(Boolean(primerEstado && primerEstado.turno), "el servidor asigna el primer turno");

        // La duración del turno se lee de la configuración del servidor (única
        // fuente de verdad): así la prueba sigue valiendo si algún día cambia.
        const DU = CONFIG.DURACION_TURNO;
        comprobar(
            Boolean(primerEstado && primerEstado.tiempo >= 1 && primerEstado.tiempo <= DU) &&
                primerEstado.duracionTurno === DU,
            `el primer turno arranca con su cronómetro (${primerEstado ? primerEstado.tiempo : 0} s de ${DU})` +
                ` y el paquete manda la duración (${primerEstado ? primerEstado.duracionTurno : "sin dato"})`
        );

        /* --- Doble salto sincronizado (mismo evento de entrada de siempre) --- */
        console.log("");
        console.log("== DOBLE SALTO SINCRONIZADO ==");

        const idSaltador = primerEstado.turno;
        const clienteSaltador = clientes.find((cliente) => cliente.id === idSaltador);

        /** Altura (y) del jugador en el último estado que ha recibido un cliente. */
        const alturaDe = (cliente, id) => {
            const paquete = cliente.estadosPartida[cliente.estadosPartida.length - 1];

            if (!paquete) {
                return null;
            }

            const jugador = (paquete.jugadores || []).find((datos) => datos.id === id);

            return jugador ? jugador.y : null;
        };

        /** Punto más alto (y mínima) que ha visto un cliente para ese jugador. */
        const alturaMinimaDe = (cliente, id) => {
            let minima = Infinity;

            cliente.estadosPartida.forEach((paquete) => {
                (paquete.jugadores || []).forEach((jugador) => {
                    if (jugador.id === id) {
                        minima = Math.min(minima, jugador.y);
                    }
                });
            });

            return minima;
        };

        const saltosDe = (cliente) => cliente.eventos
            .filter((evento) => evento.tipo === "salto" && evento.jugadorId === idSaltador).length;

        comprobar(Boolean(clienteSaltador), "se identifica al jugador con el turno para probar el doble salto");

        // Un momento para que el pollito esté apoyado sobre su plataforma.
        await new Promise((resolver) => setTimeout(resolver, 500));

        const alturaMinimaAntes = alturaMinimaDe(clientes[0], idSaltador);

        // Primer salto: ESPACIO pulsado (el cliente manda la pulsación).
        clienteSaltador.socket.emit("jugador:entrada", { saltar: true });
        await new Promise((resolver) => setTimeout(resolver, 200));

        // Se suelta ESPACIO y se vuelve a pulsar en el aire: SEGUNDO salto.
        clienteSaltador.socket.emit("jugador:entrada", { saltar: false });
        await new Promise((resolver) => setTimeout(resolver, 120));
        clienteSaltador.socket.emit("jugador:entrada", { saltar: true });
        await new Promise((resolver) => setTimeout(resolver, 250));

        const saltosEnTodos = await esperar(
            () => clientes.every((cliente) => saltosDe(cliente) >= 2),
            4000
        );

        comprobar(saltosEnTodos,
            "los 6 jugadores reciben los DOS saltos del jugador con turno (doble salto sincronizado)");

        const alturaMinimaDespues = alturaMinimaDe(clientes[0], idSaltador);

        comprobar(alturaMinimaDespues < alturaMinimaAntes - 20,
            `el doble salto se ve en la posición que reciben todos (sube de ${Math.round(alturaMinimaAntes)} a ${Math.round(alturaMinimaDespues)})`);
        comprobar(alturaDe(clientes[0], idSaltador) !== null, "los estados siguen llegando con la posición del pollito");

        // Un tercer ESPACIO en el aire no produce un tercer salto.
        const saltosAntesDelTercero = saltosDe(clientes[0]);

        clienteSaltador.socket.emit("jugador:entrada", { saltar: false });
        clienteSaltador.socket.emit("jugador:entrada", { saltar: true });
        await new Promise((resolver) => setTimeout(resolver, 400));

        comprobar(saltosDe(clientes[0]) === saltosAntesDelTercero,
            "un tercer ESPACIO en el aire no da un tercer salto (tampoco por la red)");

        // Se espera a que vuelva a estar apoyado para no alterar las pruebas
        // siguientes (disparo y explosión).
        await esperar(() => {
            const paquete = clientes[0].estadosPartida[clientes[0].estadosPartida.length - 1];
            const jugador = paquete && (paquete.jugadores || []).find((datos) => datos.id === idSaltador);

            return Boolean(jugador) && jugador.enSuelo === true;
        }, 3000);

        /* --- Disparo y explosión sincronizados --- */
        console.log("");
        console.log("== DISPARO Y EXPLOSIÓN SINCRONIZADOS ==");

        const idConTurno = primerEstado.turno;
        const clienteConTurno = clientes.find((cliente) => cliente.id === idConTurno);
        const clienteSinTurno = clientes.find((cliente) => cliente.id !== idConTurno);

        comprobar(Boolean(clienteConTurno) && Boolean(clienteSinTurno),
            "se identifica quién tiene el turno y quién no");

        clienteSinTurno.socket.emit("jugador:disparar");
        await new Promise((resolver) => setTimeout(resolver, 700));

        const disparoAjeno = clienteSinTurno.estadosPartida.some((paquete) =>
            (paquete.eventos || []).some((evento) => evento.tipo === "disparo"));
        comprobar(!disparoAjeno, "un jugador sin turno NO puede disparar (el servidor lo rechaza)");

        clienteConTurno.socket.emit("jugador:cargar", true);
        await new Promise((resolver) => setTimeout(resolver, 500));
        clienteConTurno.socket.emit("jugador:cargar", false);
        clienteConTurno.socket.emit("jugador:disparar");

        const disparoEnTodos = await esperar(() => clientes.every((cliente) =>
            cliente.eventos.some((evento) => evento.tipo === "disparo")), 5000);
        comprobar(disparoEnTodos, "los 6 clientes reciben el evento de disparo (todos pueden sonar el disparo)");

        const explosionEnTodos = await esperar(() => clientes.every((cliente) =>
            cliente.eventos.some((evento) => evento.tipo === "explosion")), 9000);
        comprobar(explosionEnTodos, "los 6 clientes reciben el evento de explosión");

        const cambioDeJugador = await esperar(() => clientes.every((cliente) =>
            cliente.eventos.filter((evento) => evento.tipo === "turno").length >= 2), 9000);
        comprobar(cambioDeJugador, "todos reciben el cambio de turno (efecto de cambio de jugador)");

        /* --- Chat de la sala (misma conexión Socket.IO) ---
           Se prueba DESPUÉS de disparos, explosiones y cambios de turno: el
           chat debe funcionar igual en plena partida. */
        console.log("");
        console.log("== CHAT DE LA SALA (TIEMPO REAL) ==");

        // Un cliente en OTRA sala: los mensajes no pueden cruzarse nunca.
        const ajeno = crearCliente(io, "Ajeno");
        await esperar(() => ajeno.id, 8000);
        const salaAjena = await enviar(ajeno, "sala:crear", { nombre: "Ajeno" });
        comprobar(salaAjena.ok === true, "un jugador entra en OTRA sala (para comprobar el aislamiento del chat)");

        // El límite de caracteres lo publica el servidor: el cliente no tiene copia.
        comprobar(
            Boolean(clientes[0].chatConfig) && clientes[0].chatConfig.longitudMaxima === CONFIG.CHAT_LONGITUD_MAXIMA,
            `el servidor publica la configuración del chat (máximo ${CONFIG.CHAT_LONGITUD_MAXIMA} caracteres)`
        );

        const envio1 = await enviar(clientes[0], "chat:enviar", { texto: "¡Prepárate!" });
        comprobar(envio1.ok === true, "el jugador 1 escribe \"¡Prepárate!\"");

        const llegaATodos = await esperar(() => clientes.every((cliente) => cliente.chatMensajes.length >= 1), 4000);
        comprobar(llegaATodos, "los 6 jugadores de la sala reciben el mensaje al instante");

        const primerMensaje = clientes[0].chatMensajes[0] || {};
        comprobar(primerMensaje.texto === "¡Prepárate!", "el mensaje llega con el texto exacto");
        comprobar(primerMensaje.nombre === "Brandon1", "el servidor pone el nombre de quien escribe (no el cliente)");
        comprobar(
            primerMensaje.colorNombre === CONFIG.COLORES_JUGADOR[0].nombre &&
                primerMensaje.color === CONFIG.COLORES_JUGADOR[0].color,
            `el servidor pone el color del jugador 1 (${primerMensaje.colorNombre})`
        );
        comprobar(
            clientes.every((cliente) => cliente.chatMensajes[0] && cliente.chatMensajes[0].nombre === "Brandon1"),
            "los seis ven el mismo autor en el mensaje"
        );

        const envio2 = await enviar(clientes[1], "chat:enviar", { texto: "¡Buen tiro!" });
        comprobar(envio2.ok === true, "el jugador 2 responde \"¡Buen tiro!\" en plena partida");

        const lleganDos = await esperar(() => clientes.every((cliente) => cliente.chatMensajes.length >= 2), 4000);
        comprobar(lleganDos, "los 6 reciben también el segundo mensaje");

        comprobar(
            Boolean(clientes[0].chatMensajes[1]) &&
                clientes[0].chatMensajes[1].colorNombre === CONFIG.COLORES_JUGADOR[1].nombre,
            `cada jugador conserva su color (jugador 2 = ${CONFIG.COLORES_JUGADOR[1].nombre})`
        );

        // El texto viaja como texto plano: el cliente lo pinta con textContent,
        // así que el HTML que escriba un jugador se ve literal (no se ejecuta).
        const html = '<script>alert("hola")</script>';
        const envioHtml = await enviar(clientes[2], "chat:enviar", { texto: html });
        const llegoHtml = await esperar(() => clientes[0].chatMensajes.length >= 3, 4000);
        const mensajeHtml = clientes[0].chatMensajes[2] || {};

        comprobar(envioHtml.ok === true && llegoHtml, "un mensaje con HTML se acepta y llega a la sala");
        comprobar(mensajeHtml.texto === html,
            "el HTML se retransmite literal (el cliente lo pinta como texto, no lo ejecuta)");

        // Mensajes demasiado largos: el servidor los recorta al máximo.
        const envioLargo = await enviar(clientes[3], "chat:enviar", {
            texto: "z".repeat(CONFIG.CHAT_LONGITUD_MAXIMA + 80)
        });
        const llegoLargo = await esperar(() => clientes[0].chatMensajes.length >= 4, 4000);
        const mensajeLargo = clientes[0].chatMensajes[3] || {};

        comprobar(envioLargo.ok === true && llegoLargo, "un mensaje larguísimo se acepta recortado");
        comprobar(
            String(mensajeLargo.texto || "").length === CONFIG.CHAT_LONGITUD_MAXIMA,
            `el servidor recorta el mensaje a ${CONFIG.CHAT_LONGITUD_MAXIMA} caracteres` +
                ` (llegaron ${String(mensajeLargo.texto || "").length})`
        );

        // Mensajes inválidos: nunca se retransmiten.
        const antesDeInvalidos = clientes[0].chatMensajes.length;
        const vacio = await enviar(clientes[0], "chat:enviar", { texto: "     " });
        const noEsTexto = await enviar(clientes[4], "chat:enviar", { texto: { malicioso: true } });
        const sinDatos = await enviar(clientes[5], "chat:enviar", null);
        await new Promise((resolver) => setTimeout(resolver, 500));

        comprobar(vacio.ok === false, "el servidor rechaza un mensaje vacío (solo espacios)");
        comprobar(noEsTexto.ok === false, "el servidor rechaza un mensaje que no es texto");
        comprobar(sinDatos.ok === false, "el servidor rechaza un envío sin datos");
        comprobar(clientes[0].chatMensajes.length === antesDeInvalidos,
            "los mensajes inválidos no se retransmiten a la sala");

        // Aislamiento entre salas.
        comprobar(ajeno.chatMensajes.length === 0, "un jugador de OTRA sala NO recibe ningún mensaje de esta sala");

        // El chat no toca la lógica del juego.
        const estadoConChat = clientes[0].estadosPartida[clientes[0].estadosPartida.length - 1];
        comprobar(
            Boolean(estadoConChat) && estadoConChat.estado !== "finalizado" &&
                (estadoConChat.jugadores || []).length === 6,
            "el chat no altera la partida (sigue en curso y con los 6 jugadores)"
        );
        comprobar(Boolean(estadoConChat && estadoConChat.turno), "el turno sigue vivo después de chatear");
        comprobar(
            !clientes[0].eventos.some((evento) => String(evento.tipo).indexOf("chat") === 0),
            "el chat no genera eventos de juego (turnos, disparos, daño)"
        );

        // Límite de mensajes por segundo: el spam se descarta.
        const respuestasSpam = await Promise.all(
            Array.from({ length: 8 }, (valor, indice) => enviar(clientes[5], "chat:enviar", { texto: `spam ${indice}` }))
        );
        const rechazados = respuestasSpam.filter((respuesta) => respuesta.ok === false).length;

        comprobar(rechazados >= 1,
            `el servidor frena el spam (${rechazados} de 8 mensajes rechazados por ir demasiado rápido)`);

        ajeno.socket.disconnect();

        /* --- Desconexión y fin de partida --- */
        console.log("");
        console.log("== DESCONEXIÓN Y FIN DE PARTIDA ==");

        clientes.slice(1).forEach((cliente) => cliente.socket.disconnect());
        await new Promise((resolver) => setTimeout(resolver, 1500));

        const finRecibido = await esperar(() => clientes[0].eventos.some((evento) => evento.tipo === "fin-partida"), 6000);
        comprobar(finRecibido, "al quedar un solo jugador la partida termina (evento fin-partida: game over)");

        const estadoFinal = clientes[0].estadosPartida[clientes[0].estadosPartida.length - 1];
        comprobar(Boolean(estadoFinal && estadoFinal.estado === "finalizado"),
            "el estado final llega marcado como finalizado");
        comprobar(Boolean(estadoFinal && estadoFinal.ganador),
            "el estado final incluye el ganador (se puede mostrar VICTORIA)");

        clientes[0].socket.disconnect();
    } catch (error) {
        fallos.push(`error inesperado: ${error.message}`);
        console.error("  ERROR inesperado en la prueba:", error);
    } finally {
        apagar();
    }

    console.log("");
    console.log("=========================================================");
    console.log(`  Pruebas ejecutadas: ${pruebas}   Fallos: ${fallos.length}`);
    console.log("=========================================================");

    if (fallos.length) {
        fallos.forEach((fallo) => console.log(`  - ${fallo}`));
        process.exitCode = 1;
    } else {
        console.log("  CREAR SALA -> CÓDIGO -> 6 JUGADORES -> PARTIDA -> DISPARO");
        console.log("  -> EXPLOSIÓN -> CHAT EN TIEMPO REAL -> GAME OVER: comprobado");
        console.log("  con el servidor y el protocolo reales.");
        console.log("");
    }

    // Cierra el proceso aunque queden temporizadores de los clientes.
    setTimeout(() => process.exit(fallos.length ? 1 : 0), 400);
})();

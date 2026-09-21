/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Sala de juego (lobby + partida)
 * =========================================================
 *
 * Una sala agrupa hasta seis jugadores. Se identifica con un código corto
 * que se comparte para que otros puedan entrar ("UNIRSE A SALA").
 *
 * Responsabilidades:
 *  - Gestionar los seis espacios del lobby (nombre, personaje y listo).
 *  - Informar a todos los jugadores de cada conexión y desconexión.
 *  - Crear la partida autoritativa cuando todos están listos.
 *  - Simular y emitir el estado a la frecuencia configurada.
 *
 * La lógica de juego NO vive aquí: vive en Partida (motor autoritativo).
 */

const CONFIG = require("./config");
const Partida = require("./partida");

class Sala {
    /**
     * @param {string} codigo Código corto de la sala (por ejemplo "PEA7").
     */
    constructor(codigo) {
        this.codigo = codigo;
        this.estado = "lobby"; // "lobby" o "jugando"
        this.jugadores = new Map(); // idSocket -> jugador de sala
        this.partida = null;
        this.creadaEn = Date.now();
        this.ultimaActividad = Date.now();
        this.acumuladorSimulacion = 0;
        this.acumuladorEstado = 0;
        this.acumuladorLobby = 0;
        this.lobbySucio = true;
        this.enviarInicio = false;
        this.notificaciones = [];
    }

    get cantidadJugadores() {
        return this.jugadores.size;
    }

    get lleno() {
        return this.jugadores.size >= CONFIG.MAX_JUGADORES;
    }

    get vacia() {
        return this.jugadores.size === 0;
    }

    /**
     * Jugadores de la sala como array, ordenados por espacio.
     */
    listaJugadores() {
        return [...this.jugadores.values()].sort((a, b) => a.indice - b.indice);
    }

    /**
     * Añade una notificación de sala (se envía una sola vez a todos).
     *
     * @param {object} notificacion { tipo, nombre }
     */
    notificar(notificacion) {
        this.notificaciones.push(notificacion);
    }

    /**
     * Busca el primer espacio libre (0..5).
     */
    primerEspacioLibre() {
        const ocupados = new Set(this.listaJugadores().map((jugador) => jugador.indice));

        for (let indice = 0; indice < CONFIG.MAX_JUGADORES; indice++) {
            if (!ocupados.has(indice)) {
                return indice;
            }
        }

        return -1;
    }

    /**
     * Busca el primer personaje libre (para que no se repitan).
     */
    primerPersonajeLibre() {
        const usados = new Set(this.listaJugadores().map((jugador) => jugador.personaje));

        for (let indice = 0; indice < CONFIG.PERSONAJES.length; indice++) {
            if (!usados.has(indice)) {
                return indice;
            }
        }

        return 0;
    }

    /**
     * Añade un jugador a la sala.
     *
     * @param {string} id Id del socket.
     * @param {string} nombre Nombre elegido por el jugador.
     * @returns {object} { ok, mensaje?, jugador? }
     */
    unir(id, nombre) {
        if (this.estado !== "lobby") {
            return { ok: false, mensaje: "Esta sala ya está en partida. Crea una sala nueva." };
        }

        if (this.lleno) {
            return { ok: false, mensaje: "La sala está completa (6/6 jugadores)." };
        }

        const indice = this.primerEspacioLibre();

        if (indice === -1) {
            return { ok: false, mensaje: "No hay espacios libres en la sala." };
        }

        const limpio = String(nombre || "").replace(/\s+/g, " ").trim().slice(0, 18);
        const jugador = {
            id,
            nombre: limpio || `Jugador ${indice + 1}`,
            personaje: this.primerPersonajeLibre(),
            indice,
            listo: false,
            conectado: true,
            unidoEn: Date.now()
        };

        this.jugadores.set(id, jugador);
        this.lobbySucio = true;
        this.ultimaActividad = Date.now();
        this.notificar({ tipo: "conexion", nombre: jugador.nombre, jugadorId: id });

        return { ok: true, jugador };
    }

    /**
     * Saca a un jugador de la sala y de la partida en curso.
     *
     * @param {string} id Id del socket.
     * @returns {object|null} Jugador que se fue, o null si no estaba.
     */
    salir(id) {
        const jugador = this.jugadores.get(id);

        if (!jugador) {
            return null;
        }

        this.jugadores.delete(id);
        this.lobbySucio = true;
        this.ultimaActividad = Date.now();

        if (this.partida) {
            // No se sustituye por IA: su personaje queda fuera y la partida
            // continúa para los jugadores que siguen conectados.
            this.partida.quitarJugador(id);
        }

        this.notificar({ tipo: "desconexion", nombre: jugador.nombre, jugadorId: id });

        // Si la partida ya había terminado, la sala vuelve al lobby para poder
        // reutilizarse (nuevos jugadores o revancha).
        if (this.partida && this.partida.estado === "finalizado") {
            this.estado = "lobby";
        }

        return jugador;
    }

    /**
     * Cambia el personaje de un jugador si está libre.
     *
     * @param {string} id Id del socket.
     * @param {number} personaje Índice de personaje solicitado.
     * @returns {boolean} true si el cambio se aplicó.
     */
    elegirPersonaje(id, personaje) {
        const jugador = this.jugadores.get(id);
        const indicePersonaje = Number(personaje);

        if (!jugador || !CONFIG.PERSONAJES[indicePersonaje]) {
            return false;
        }

        const ocupado = this.listaJugadores().some((otro) => {
            return otro.id !== id && otro.personaje === indicePersonaje;
        });

        if (ocupado) {
            return false;
        }

        jugador.personaje = indicePersonaje;
        this.lobbySucio = true;
        return true;
    }

    /**
     * Marca o desmarca a un jugador como listo.
     *
     * @param {string} id Id del socket.
     * @param {boolean} listo Estado de preparación.
     * @returns {boolean}
     */
    marcarListo(id, listo) {
        const jugador = this.jugadores.get(id);

        if (!jugador) {
            return false;
        }

        jugador.listo = Boolean(listo);
        this.lobbySucio = true;
        return true;
    }

    /**
     * Indica si la partida puede comenzar: hacen falta al menos dos jugadores
     * y todos los conectados deben estar listos.
     */
    puedeIniciar() {
        const jugadores = this.listaJugadores();

        if (this.estado !== "lobby") {
            return false;
        }

        if (jugadores.length < CONFIG.MIN_JUGADORES_PARTIDA) {
            return false;
        }

        return jugadores.every((jugador) => jugador.listo);
    }

    /**
     * Crea la partida autoritativa con los jugadores actuales del lobby.
     *
     * @param {string} id Id del socket que solicita el inicio.
     * @returns {object} { ok, mensaje? }
     */
    iniciar(id) {
        if (!this.jugadores.has(id)) {
            return { ok: false, mensaje: "No perteneces a esta sala." };
        }

        if (!this.puedeIniciar()) {
            return {
                ok: false,
                mensaje: `Se necesitan al menos ${CONFIG.MIN_JUGADORES_PARTIDA} jugadores y todos deben estar listos.`
            };
        }

        this.estado = "jugando";
        this.partida = new Partida(this.listaJugadores());
        this.partida.registrarEvento({ tipo: "inicio-partida" });
        this.enviarInicio = true;
        this.acumuladorSimulacion = 0;
        this.acumuladorEstado = 0;
        this.lobbySucio = true;
        this.notificar({ tipo: "inicio-partida" });

        return { ok: true };
    }

    /**
     * Inicia una revancha con los mismos jugadores de la sala.
     *
     * @param {string} id Id del socket que solicita la revancha.
     * @returns {object} { ok, mensaje? }
     */
    reiniciar(id) {
        if (!this.jugadores.has(id) || !this.partida) {
            return { ok: false, mensaje: "No hay una partida que reiniciar." };
        }

        if (this.partida.estado !== "finalizado") {
            return { ok: false, mensaje: "La partida todavía está en curso." };
        }

        if (this.cantidadJugadores < CONFIG.MIN_JUGADORES_PARTIDA) {
            return {
                ok: false,
                mensaje: `Hacen falta ${CONFIG.MIN_JUGADORES_PARTIDA} jugadores como mínimo para la revancha.`
            };
        }

        this.partida.reiniciar(this.listaJugadores());
        this.enviarInicio = true;
        this.acumuladorSimulacion = 0;
        this.acumuladorEstado = 0;
        this.notificar({ tipo: "inicio-partida" });

        return { ok: true };
    }

    /**
     * Avanza la simulación de la sala y acumula los envíos pendientes.
     *
     * @param {number} milisegundos Tiempo real transcurrido desde el último tick.
     */
    actualizar(milisegundos) {
        const paso = CONFIG.PASO_SIMULACION;
        this.acumuladorLobby += milisegundos;

        if (this.partida) {
            this.acumuladorSimulacion += Math.min(milisegundos, 250) / 1000;

            // Paso fijo: la física no depende de la carga del servidor.
            let pasos = 0;
            while (this.acumuladorSimulacion >= paso && pasos < 12) {
                this.partida.actualizar(paso);
                this.acumuladorSimulacion -= paso;
                pasos += 1;
            }

            this.acumuladorEstado += milisegundos;
        }
    }

    /**
     * Paquete de lobby pendiente, o null si no hay nada que enviar.
     *
     * Se envía cuando algo cambia (entrada, salida, listo, personaje) y
     * además cada segundo como latido para refrescar contadores.
     *
     * @returns {object|null}
     */
    tomarPaqueteLobby() {
        const latido = this.acumuladorLobby >= 1000;

        if (!this.lobbySucio && !latido && !this.notificaciones.length) {
            return null;
        }

        this.lobbySucio = false;
        this.acumuladorLobby = 0;

        const notificaciones = this.notificaciones;
        this.notificaciones = [];

        const jugadores = this.listaJugadores();
        const listos = jugadores.filter((jugador) => jugador.listo).length;

        return {
            tipo: "sala",
            codigo: this.codigo,
            estado: this.estado,
            maxJugadores: CONFIG.MAX_JUGADORES,
            minJugadores: CONFIG.MIN_JUGADORES_PARTIDA,
            jugadores: jugadores.map((jugador) => ({
                id: jugador.id,
                nombre: jugador.nombre,
                personaje: jugador.personaje,
                indice: jugador.indice,
                listo: jugador.listo,
                conectado: jugador.conectado
            })),
            conectados: jugadores.length,
            listos,
            puedeIniciar: this.puedeIniciar(),
            enPartida: Boolean(this.partida),
            terminada: Boolean(this.partida) && this.partida.estado === "finalizado",
            personajes: CONFIG.PERSONAJES,
            notificaciones
        };
    }

    /**
     * Paquete de partida pendiente, o null si todavía no toca enviarlo.
     *
     * El primer paquete tras empezar o reiniciar la partida es completo
     * (mundo + cráteres) para que el cliente reconstruya todo.
     *
     * @returns {object|null}
     */
    tomarPaquetePartida() {
        if (!this.partida) {
            return null;
        }

        if (this.enviarInicio) {
            this.enviarInicio = false;
            this.acumuladorEstado = 0;
            return this.partida.instantaneaInicial();
        }

        if (this.acumuladorEstado < CONFIG.FRECUENCIA_ESTADO) {
            return null;
        }

        this.acumuladorEstado = 0;
        return this.partida.instantanea();
    }

    /**
     * Envía una acción de un jugador al motor autoritativo.
     *
     * @param {string} id Id del socket.
     * @param {string} accion "entrada", "cargar" o "disparar".
     * @param {*} datos Datos de la acción.
     * @returns {boolean} true si la acción fue aceptada por el motor.
     */
    accion(id, accion, datos) {
        if (!this.partida || this.estado !== "jugando") {
            return false;
        }

        if (accion === "entrada") {
            return this.partida.entrada(id, datos);
        }

        if (accion === "cargar") {
            return this.partida.cargar(id, datos);
        }

        if (accion === "disparar") {
            return this.partida.disparar(id);
        }

        return false;
    }
}

module.exports = Sala;



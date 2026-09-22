/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Configuración del mundo
 * =========================================================
 *
 * Este archivo es la ÚNICA fuente de verdad de las constantes del juego.
 * El servidor simula con ellas y el cliente las recibe dentro del paquete
 * "partida:inicio", de modo que nunca hay dos copias de los números que
 * puedan desincronizarse.
 *
 * Los valores se conservan del juego original (gravedad, salto, potencia,
 * ángulo, viento, radios de explosión y daño). Cambiarlos aquí cambia el
 * juego completo, en servidor y cliente.
 */

const CONFIG = {
    // --- Dimensiones del mundo -------------------------------------------
    ANCHO: 1200,
    ALTO: 600,

    /**
     * Escenario actual de la partida.
     *
     * El cliente lo recibe en el paquete inicial y elige la música
     * correspondiente (assets/sonidos/musica/escenarios/escenario_N). Si ese
     * escenario todavía no tiene archivo, el cliente usa automáticamente la
     * música general de batalla. Añadir escenarios nuevos no cambia nada del
     * motor: basta con enviar otro número.
     */
    ESCENARIO: 1,

    // --- Sala -------------------------------------------------------------
    MAX_JUGADORES: 6,
    MIN_JUGADORES_PARTIDA: 2,
    MAX_SALAS: 250,
    SEGUNDOS_SALA_VACIA: 20,

    // --- Chat de sala -----------------------------------------------------
    /**
     * Longitud máxima de un mensaje de chat, en caracteres.
     *
     * El servidor recorta aquí cualquier mensaje que llegue más largo (nunca
     * se fía de lo que envía el cliente) y publica el número en la
     * configuración de chat que recibe cada jugador al conectarse
     * (ver servidor/servidor.js -> "conexion:identidad"), así que el campo de
     * texto del cliente usa EXACTAMENTE este límite y no una copia propia.
     */
    CHAT_LONGITUD_MAXIMA: 100,

    /**
     * Mensajes que puede enviar un mismo jugador por segundo.
     *
     * Frena el spam sin estorbar en una conversación normal: al superarlo, el
     * servidor descarta el mensaje y responde con un aviso.
     */
    CHAT_MENSAJES_POR_SEGUNDO: 4,

    /**
     * Color de identificación de cada jugador en el chat (los seis colores de
     * una sala completa).
     *
     * Se asigna por ESPACIO en la sala (jugador.indice 0..5): el primer
     * jugador es ROJO, el segundo AZUL y así hasta MORADO. El servidor pone el
     * color en cada mensaje (nunca el cliente), así que todos los equipos ven
     * el mismo color para el mismo jugador y aquí está la ÚNICA tabla de
     * colores del chat.
     */
    COLORES_JUGADOR: [
        { nombre: "ROJO", color: "#ff5c5c" },
        { nombre: "AZUL", color: "#5ec8ff" },
        { nombre: "VERDE", color: "#6ee06a" },
        { nombre: "AMARILLO", color: "#ffd166" },
        { nombre: "NARANJA", color: "#ff9f1c" },
        { nombre: "MORADO", color: "#c3a6ff" }
    ],

    // --- Tiempos ----------------------------------------------------------
    PASO_SIMULACION: 1 / 30, // segundos por paso autoritativo
    FRECUENCIA_ESTADO: 50, // milisegundos entre paquetes de estado

    /**
     * Segundos que dura el turno de cada jugador.
     *
     * ÚNICO sitio donde se decide esta duración: el servidor cierra el turno
     * con este valor y lo envía dentro de cada paquete de estado
     * ("duracionTurno"), así que el HUD del cliente dibuja el reloj con la
     * misma duración sin tener una segunda copia del número. Cambiar aquí 12
     * por otro número cambia el cronómetro de todos los jugadores a la vez.
     */
    DURACION_TURNO: 12,
    RETARDO_FIN_TURNO: 1, // segundos de margen tras resolverse el último disparo

    // --- Personajes -------------------------------------------------------
    RADIO_PERSONAJE: 17,
    VIDA_MAXIMA: 100,
    VELOCIDAD_CAMINAR: 140,

    /**
     * Fuerza del salto (px/s).
     *
     * La usan LOS DOS saltos del pollo: el segundo salto no tiene una fuerza
     * propia, es exactamente la misma (ver SALTOS_MAXIMOS).
     */
    FUERZA_SALTO: 300,

    /**
     * Saltos que puede dar un POLLO antes de volver a tocar una superficie.
     *
     * 2 = doble salto: ESPACIO en el suelo y ESPACIO otra vez en el aire. El
     * contador se reinicia al aterrizar sobre cualquier superficie válida
     * (terreno, plataformas o escalones de distintas alturas).
     *
     * Es un número de partida, así que vive aquí (única fuente de verdad): lo
     * aplica el motor autoritativo (servidor/partida.js) y, al saltar, el
     * resultado viaja a todos los clientes con el paquete de estado de siempre.
     *
     * Solo los POLLOS (los jugadores) usan este límite: cualquier otro tipo de
     * personaje que se añada en el futuro se queda con un único salto.
     */
    SALTOS_MAXIMOS: 2,

    GRAVEDAD: 900,
    ALTURA_ESCALON: 25, // escalón máximo que se sube caminando (grosor de plataforma original)
    NIVEL_AGUA: 560, // por debajo de esta altura el pollito se ahoga

    // --- Cañón ------------------------------------------------------------
    ANGULO_INICIAL: 30,
    ANGULO_MAXIMO: 80,
    VELOCIDAD_ANGULO: 60, // grados por segundo al mantener W / S
    POTENCIA_MINIMA: 250,
    POTENCIA_MAXIMA: 620,
    VELOCIDAD_CARGA: 280, // potencia por segundo (igual que el original)
    LONGITUD_CANON: 34,

    // --- Proyectiles y viento --------------------------------------------
    RADIO_PROYECTIL: 6,
    GRAVEDAD_PROYECTIL: 500,
    VIENTO_INICIAL: 8,
    VIENTO_MAXIMO: 20,
    VIENTO_FACTOR: 2.2, // multiplicador del viento sobre el proyectil
    PROBABILIDAD_VIENTO: 0.008, // probabilidad de deriva por paso (0.008 a 30 pasos/s)
    DERIVA_VIENTO: 10,

    // --- Explosiones ------------------------------------------------------
    RADIO_EXPLOSION_TERRENO: 60,
    RADIO_EXPLOSION_PERSONAJE: 65,
    RADIO_CRATER: 0.8, // proporción del radio de daño que se excava en el terreno
    DANIO_MAXIMO: 100,
    DURACION_EXPLOSION: 0.7,

    // --- Terreno ----------------------------------------------------------
    CELDA: 8, // tamaño de celda de la rejilla destruible

    /**
     * Plataformas del mapa original (mismas que js/terreno.js).
     *
     * Las coordenadas se han alineado a la rejilla de 8 px (CELDA) para que
     * la rejilla represente el mapa con exactitud: con coordenadas libres,
     * una plataforma que empieza en y=370 se rasterizaba desde y=368 y los
     * personajes quedaban 2 px más altos. La forma del mapa es la misma
     * (el desplazamiento máximo respecto al original es de 4 px).
     */
    PLATAFORMAS: [
        // Plataformas inferiores: base de la arena.
        { x: 0, y: 496, ancho: 192, alto: 104 },
        { x: 232, y: 448, ancho: 192, alto: 152 },
        { x: 472, y: 512, ancho: 176, alto: 88 },
        { x: 704, y: 448, ancho: 200, alto: 152 },
        { x: 952, y: 496, ancho: 248, alto: 104 },

        // Plataformas intermedias (25 px de grosor en el original).
        { x: 80, y: 368, ancho: 184, alto: 24 },
        { x: 328, y: 312, ancho: 152, alto: 24 },
        { x: 600, y: 368, ancho: 184, alto: 24 },
        { x: 904, y: 312, ancho: 168, alto: 24 },
        { x: 1088, y: 392, ancho: 104, alto: 24 },

        // Plataformas superiores.
        { x: 24, y: 248, ancho: 120, alto: 24 },
        { x: 216, y: 184, ancho: 152, alto: 24 },
        { x: 1112, y: 144, ancho: 72, alto: 24 }
    ],

    /**
     * Personajes disponibles: cada uno es un pollito con identidad propia.
     * El cliente solo dibuja; elegir personaje es una decisión de sala.
     */
    PERSONAJES: [
        { id: 0, nombre: "Pollito Clásico", cuerpo: "#ffffff", cresta: "#ff5c5c", pico: "#ffb347" },
        { id: 1, nombre: "Pollito Dorado", cuerpo: "#ffd166", cresta: "#ff8c42", pico: "#ff9f1c" },
        { id: 2, nombre: "Pollito Verde", cuerpo: "#8ee06a", cresta: "#3fa34d", pico: "#f7b32b" },
        { id: 3, nombre: "Pollito Celeste", cuerpo: "#8fd6ff", cresta: "#3d8fd1", pico: "#ffb347" },
        { id: 4, nombre: "Pollito Rosa", cuerpo: "#ffa8d2", cresta: "#e4568f", pico: "#ffd166" },
        { id: 5, nombre: "Pollito Morado", cuerpo: "#c3a6ff", cresta: "#7c4dff", pico: "#ffc857" }
    ]
};

module.exports = CONFIG;

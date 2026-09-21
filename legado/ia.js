/*
 * ============================================================
 * IA DE LOS GUSANOS - MOVIMIENTO + DISPARO TÁCTICO
 * ============================================================
 *
 * PRIORIDAD DE LA IA:
 *
 * 1. Buscar un objetivo.
 * 2. Buscar una trayectoria de disparo.
 * 3. Comprobar si hay bloques en el camino.
 * 4. Si hay un bloque:
 *      -> NO dispara.
 *      -> busca una posición lateral.
 *      -> se mueve.
 *      -> vuelve a calcular.
 * 5. Si existe una trayectoria libre:
 *      -> dispara.
 *
 * La IA NO utiliza saltos.
 */

// ============================================================
// DIFICULTAD
// ============================================================

const CONFIG_DIFICULTAD = {

    "Fácil": {
        errorAngulo: 18,
        errorPotencia: 55,
        probabilidadMover: 0.45,
        estrategia: "cercano"
    },

    "Normal": {
        errorAngulo: 8,
        errorPotencia: 25,
        probabilidadMover: 0.75,
        estrategia: "equilibrado"
    },

    "Difícil": {
        errorAngulo: 2,
        errorPotencia: 7,
        probabilidadMover: 1.0,
        estrategia: "asesino"
    }
};


// ============================================================
// FÍSICA DEL PROYECTIL
// ============================================================

const GRAVEDAD_PROYECTIL = 500;

const ACELERACION_VIENTO_PROYECTIL = 2.2;

const RADIO_PROYECTIL = 6;


// ============================================================
// DISPARO
// ============================================================

const POTENCIA_MINIMA = 180;

const POTENCIA_MAXIMA = 680;

const ANGULO_MINIMO = 5;

const ANGULO_MAXIMO = 85;

const DISTANCIA_IMPACTO = 28;


// ============================================================
// MOVIMIENTO
// ============================================================

// Distancia que queremos recorrer al buscar
// una nueva posición de disparo.
const DISTANCIA_REPOSICION = 100;

// Distancia mínima que debe moverse.
const MOVIMIENTO_MINIMO = 35;

// Cuando está demasiado lejos intenta acercarse.
const DISTANCIA_MUY_LEJOS = 250;

// ------------------------------------------------------------
// BÚSQUEDA DE POSICIÓN DE ATAQUE
// ------------------------------------------------------------

// Distancias laterales que prueba la IA cuando el disparo está
// bloqueado por una plataforma. El mapa mide 1200 px de ancho.
const DISTANCIAS_BUSQUEDA = [50, 100, 150, 200, 250];

// Máximo de posiciones que se llegan a simular por decisión.
// Cada simulación de trayectoria cuesta unos 300 ms, por lo que se
// prueban pocas posiciones para mantener el juego fluido.
const MAX_POSICIONES_PROBADAS = 3;

// Máximo de intentos de reposicionamiento seguidos.
const MAX_INTENTOS_REPOSICION = 8;

// Si al turno le queda menos tiempo que esto, la IA deja de buscar.
const TIEMPO_MINIMO_BUSQUEDA = 0.9;

// Dos posiciones se consideran la misma si están a menos de esta distancia.
const TOLERANCIA_POSICION_REPETIDA = 18;

// Margen lateral para no pegarse a los bordes del mapa.
const MARGEN_BORDE_MAPA = 28;


// ============================================================
// UTILIDAD
// ============================================================

function limitar(valor, minimo, maximo) {

    return Math.min(
        maximo,
        Math.max(minimo, valor)
    );
}


// ============================================================
// IA
// ============================================================

class IA {

    constructor(juego) {

        this.juego = juego;

        this.gusanoActual = null;

        this.objetivoActual = null;

        this.estado = "inactivo";

        this.temporizador = 0;

        this.direccionMovimiento = 0;

        this.puntoMovimiento = null;

        this.plataformaActual = null;

        this.haDisparado = false;

        this.ultimoDisparo = null;

        // Cuántas veces ha intentado cambiar de posición
        // durante el turno.
        this.intentosReposicion = 0;

        // Evita quedarse repitiendo el mismo movimiento.
        this.ultimaPosicionObjetivo = null;

        // Posiciones ya visitadas durante el turno: impiden que la IA
        // vaya de izquierda a derecha sin avanzar.
        this.posicionesVisitadas = [];

        // Mejor posición de ataque encontrada hasta ahora.
        this.mejorPosicionAtaque = null;

        // Direcciones usadas para detectar movimientos oscilantes.
        this.historialDirecciones = [];

        // Dirección en la que se está acercando al objetivo.
        this.direccionAcercamiento = 0;
    }


    // ========================================================
    // INICIAR TURNO
    // ========================================================

    iniciar(gusano) {

        this.gusanoActual = gusano;

        this.objetivoActual = null;

        this.estado = "pensando";

        this.temporizador = 0.35;

        this.direccionMovimiento = 0;

        this.puntoMovimiento = null;

        this.plataformaActual = null;

        this.haDisparado = false;

        this.ultimoDisparo = null;

        this.intentosReposicion = 0;

        this.ultimaPosicionObjetivo = null;

        this.posicionesVisitadas = [];

        this.mejorPosicionAtaque = null;

        this.historialDirecciones = [];

        this.direccionAcercamiento = 0;

        if (gusano && gusano.detener) {

            gusano.detener();
        }
    }


    // ========================================================
    // ACTUALIZAR
    // ========================================================

    actualizar(delta) {

        if (
            this.estado === "inactivo" ||
            !this.gusanoActual ||
            !this.gusanoActual.vivo
        ) {

            return;
        }


        // Esperar proyectil.
        if (
            this.estado === "esperandoProyectil"
        ) {

            this.comprobarFinDisparo();

            return;
        }


        // Espera después del impacto.
        if (
            this.estado === "esperandoTiempo"
        ) {
            // El personaje ya disparó en este turno. Permanece inactivo
            // hasta que Turnos agote los diez segundos y cambie el turno.
            return;
        }


        // ----------------------------------------------------
        // MOVIMIENTO
        // ----------------------------------------------------

        if (
            this.estado === "moviendo"
        ) {

            this.actualizarMovimiento();

            return;
        }


        this.temporizador -= delta;

        if (
            this.temporizador > 0
        ) {

            return;
        }


        switch (
            this.estado
        ) {

            case "pensando":

                this.analizarSituacion();

                break;


            case "apuntando":

                this.dispararAlObjetivo();

                break;


            default:

                this.estado = "pensando";

                this.temporizador = 0.15;

                break;
        }
    }


    // ========================================================
    // CONFIGURACIÓN
    // ========================================================

    obtenerConfiguracion() {

        return (

            CONFIG_DIFICULTAD[
                this.juego.dificultad
            ]

            ||

            CONFIG_DIFICULTAD["Normal"]
        );
    }


    // ========================================================
    // PLATAFORMAS
    // ========================================================

    obtenerPlataformas() {

        if (
            this.juego.terreno &&
            Array.isArray(
                this.juego.terreno.plataformas
            )
        ) {

            return this.juego.terreno.plataformas;
        }

        return [];
    }


    // ========================================================
    // PLATAFORMA ACTUAL
    // ========================================================

    buscarPlataformaActual(personaje) {

        if (!personaje) {

            return null;
        }


        const plataformas =
            this.obtenerPlataformas();


        const pies =
            personaje.y +
            personaje.radio;


        let mejor = null;

        let menorDistancia =
            Infinity;


        for (
            const plataforma of plataformas
        ) {

            const ocupa =

                personaje.x +
                    personaje.radio >
                    plataforma.x

                &&

                personaje.x -
                    personaje.radio <
                    plataforma.x +
                    plataforma.ancho;


            if (!ocupa) {

                continue;
            }


            const diferencia =
                Math.abs(
                    pies -
                    plataforma.y
                );


            if (
                diferencia <= 25 &&
                diferencia < menorDistancia
            ) {

                mejor =
                    plataforma;

                menorDistancia =
                    diferencia;
            }
        }


        return mejor;
    }


    // ========================================================
    // ZONA SEGURA
    // ========================================================

    obtenerZonaSegura(plataforma) {

        if (!plataforma) {

            return null;
        }


        const radio =
            this.gusanoActual?.radio ||
            17;


        const margen =
            radio + 18;


        return {

            inicio:
                plataforma.x +
                margen,

            fin:
                plataforma.x +
                plataforma.ancho -
                margen
        };
    }


    // ========================================================
    // SELECCIONAR OBJETIVO
    // ========================================================

    seleccionarObjetivo() {

        const pollos =
            this.juego.pollos || [];


        const vivos =
            pollos.filter(
                pollo =>
                    pollo &&
                    pollo.vivo &&
                    pollo.vida > 0
            );


        if (
            vivos.length === 0
        ) {

            return null;
        }


        const config =
            this.obtenerConfiguracion();


        // Fácil: enemigo cercano.
        if (
            config.estrategia ===
            "cercano"
        ) {

            vivos.sort(
                (a, b) => {

                    return (

                        this.calcularDistancia(
                            this.gusanoActual,
                            a
                        )

                        -

                        this.calcularDistancia(
                            this.gusanoActual,
                            b
                        )
                    );
                }
            );

            return vivos[0];
        }


        // Difícil: menor vida.
        if (
            config.estrategia ===
            "asesino"
        ) {

            vivos.sort(
                (a, b) => {

                    if (
                        a.vida !==
                        b.vida
                    ) {

                        return (
                            a.vida -
                            b.vida
                        );
                    }


                    return (

                        this.calcularDistancia(
                            this.gusanoActual,
                            a
                        )

                        -

                        this.calcularDistancia(
                            this.gusanoActual,
                            b
                        )
                    );
                }
            );

            return vivos[0];
        }


        // Normal.
        vivos.sort(
            (a, b) => {

                const puntuacionA =

                    a.vida +

                    this.calcularDistancia(
                        this.gusanoActual,
                        a
                    ) *
                    0.15;


                const puntuacionB =

                    b.vida +

                    this.calcularDistancia(
                        this.gusanoActual,
                        b
                    ) *
                    0.15;


                return (
                    puntuacionA -
                    puntuacionB
                );
            }
        );


        return vivos[0];
    }


    // ========================================================
    // DISTANCIA
    // ========================================================

    calcularDistancia(
        origen,
        destino
    ) {

        if (
            !origen ||
            !destino
        ) {

            return Infinity;
        }


        return Math.hypot(

            destino.x -
            origen.x,

            destino.y -
            origen.y
        );
    }


    // ========================================================
    // ANALIZAR
    // ========================================================

    analizarSituacion() {

        const gusano =
            this.gusanoActual;


        if (
            !gusano ||
            !gusano.vivo
        ) {

            this.finalizarTurno();

            return;
        }


        /*
         * Si ya disparó en este turno, no se analiza nada más:
         * cada personaje dispara una sola vez por turno.
         */

        if (
            gusano.disparoRealizado ||
            this.haDisparado
        ) {

            this.estado =
                "esperandoTiempo";

            return;
        }


        const objetivo =
            this.seleccionarObjetivo();


        if (!objetivo) {

            /*
             * Sin pollos vivos la partida ya está decidida:
             * se espera a que el cronómetro cierre el turno.
             */

            this.estado =
                "esperandoTiempo";

            return;
        }


        this.objetivoActual =
            objetivo;


        this.plataformaActual =
            this.buscarPlataformaActual(
                gusano
            );


        // ====================================================
        // PRIORIDAD 1: DISPARAR DESDE LA POSICIÓN ACTUAL
        // ====================================================

        const tiro =
            this.buscarMejorDisparo(
                gusano,
                objetivo,
                gusano.x
            );


        if (
            tiro &&
            !tiro.bloqueado &&
            tiro.distancia <=
                DISTANCIA_IMPACTO
        ) {

            this.intentosReposicion = 0;

            this.prepararDisparo();

            return;
        }


        // ====================================================
        // DISPARO BLOQUEADO POR UNA PLATAFORMA
        //
        // AQUÍ NUNCA SE DISPARA: se busca posición y se camina.
        // ====================================================

        if (
            tiro &&
            tiro.bloqueado
        ) {

            this.buscarPosicionYMoverse(
                gusano,
                objetivo
            );

            return;
        }


        // ====================================================
        // TIRO LIBRE PERO MUY LEJANO
        // ====================================================

        const distancia =
            this.calcularDistancia(
                gusano,
                objetivo
            );


        if (
            distancia >
            DISTANCIA_MUY_LEJOS
        ) {

            const config =
                this.obtenerConfiguracion();


            if (
                Math.random() <
                config.probabilidadMover
            ) {

                const posicion =
                    this.buscarPosicionDeAtaque(
                        gusano,
                        objetivo
                    );


                if (
                    posicion !== null
                ) {

                    this.intentosReposicion++;

                    if (
                        this.prepararMovimientoA(
                            posicion
                        )
                    ) {

                        return;
                    }
                }
            }
        }


        // ====================================================
        // TIRO DISPONIBLE
        // ====================================================

        if (
            tiro &&
            !tiro.bloqueado
        ) {

            this.prepararDisparo();

            return;
        }


        // ====================================================
        // SIN TRAYECTORIA: BUSCAR POSICIÓN Y MOVERSE
        // ====================================================

        this.buscarPosicionYMoverse(
            gusano,
            objetivo
        );
    }


    // ========================================================
    // BUSCAR POSICIÓN DE ATAQUE Y MOVERSE
    // ========================================================

    /**
     * El disparo desde la posición actual está bloqueado o no existe.
     *
     * Prioridades:
     *
     *   1. Encontrar una posición con disparo válido y caminar hasta ella.
     *   2. Acercarse horizontalmente al objetivo.
     *   3. Buscar un lateral (extremo contrario de la plataforma).
     *   4. Esperar y volver a analizar (nunca disparar contra el bloque).
     *
     * En todos los casos el desplazamiento es REAL: se utiliza
     * gusano.mover(-1) / gusano.mover(1) a través de prepararMovimientoA().
     */
    buscarPosicionYMoverse(
        gusano,
        objetivo
    ) {

        if (
            !gusano ||
            !gusano.vivo ||
            !objetivo ||
            this.juego.resultado
        ) {

            return;
        }


        const turnos =
            this.juego.turnos;

        const tiempoRestante =
            turnos
                ? turnos.tiempoRestante
                : 10;


        /*
         * Queda poco tiempo de turno: no se empieza una
         * búsqueda nueva, solo se aprovecha lo ya encontrado.
         */

        if (
            tiempoRestante <=
            TIEMPO_MINIMO_BUSQUEDA
        ) {

            if (
                this.mejorPosicionAtaque &&
                this.prepararMovimientoA(
                    this.mejorPosicionAtaque.x
                )
            ) {

                return;
            }


            this.estado =
                "pensando";

            this.temporizador =
                0.20;

            return;
        }


        /*
         * Protección contra el bucle izquierda / derecha.
         */

        if (
            this.movimientoOscilante()
        ) {

            this.historialDirecciones = [];

            this.posicionesVisitadas = [];

            this.puntoMovimiento = null;

            this.estado =
                "pensando";

            this.temporizador =
                0.40;

            return;
        }


        if (
            this.intentosReposicion >
            MAX_INTENTOS_REPOSICION
        ) {

            this.intentosReposicion = 0;

            this.posicionesVisitadas = [];

            this.puntoMovimiento = null;

            this.estado =
                "pensando";

            this.temporizador =
                0.35;

            return;
        }


        // ====================================================
        // PRIORIDAD 1: POSICIÓN CON DISPARO VÁLIDO
        // ====================================================

        const posicion =
            this.buscarPosicionDeAtaque(
                gusano,
                objetivo
            );


        if (
            posicion !== null
        ) {

            this.intentosReposicion++;


            if (
                this.prepararMovimientoA(
                    posicion
                )
            ) {

                return;
            }
        }


        // ====================================================
        // PRIORIDAD 2: ACERCARSE AL OBJETIVO
        // ====================================================

        if (
            this.moverseHaciaElObjetivo(
                gusano,
                objetivo
            )
        ) {

            this.intentosReposicion++;

            return;
        }


        // ====================================================
        // PRIORIDAD 3: LATERAL / EXTREMO CONTRARIO
        // ====================================================

        const lateral =
            this.obtenerMovimientoForzado(
                gusano
            );


        if (
            lateral !== null &&
            !this.esPosicionVisitada(lateral) &&
            this.prepararMovimientoA(lateral)
        ) {

            this.intentosReposicion++;

            return;
        }


        // ====================================================
        // PRIORIDAD 4: ESPERAR Y VOLVER A ANALIZAR
        // ====================================================

        this.puntoMovimiento = null;

        this.estado =
            "pensando";

        this.temporizador =
            0.25;
    }


    /**
     * Busca la mejor posición desde la que el gusano pueda disparar.
     *
     * Simula el disparo (con el mismo sistema de disparo que ya usa la
     * IA) desde cada posición candidata y devuelve la mejor, o null si
     * ninguna permite disparar.
     *
     * @returns {number|null} Coordenada X elegida.
     */
    buscarPosicionDeAtaque(
        gusano,
        objetivo
    ) {

        if (
            !gusano ||
            !objetivo
        ) {

            return null;
        }


        /*
         * Con poco tiempo de turno se reutiliza la mejor posición
         * encontrada y no se simulan trayectorias nuevas.
         */

        const turnos =
            this.juego.turnos;

        if (
            turnos &&
            turnos.tiempoRestante <=
            TIEMPO_MINIMO_BUSQUEDA &&
            this.mejorPosicionAtaque
        ) {

            return this.mejorPosicionAtaque.x;
        }


        const candidatas = [];

        const plataforma =
            this.buscarPlataformaActual(
                gusano
            );


        /*
         * Primero los extremos de la plataforma actual.
         */

        if (plataforma) {

            const zona =
                this.obtenerZonaSegura(
                    plataforma
                );


            candidatas.push(
                zona.inicio
            );

            candidatas.push(
                zona.fin
            );
        }


        /*
         * Después posiciones laterales a distintas distancias.
         */

        DISTANCIAS_BUSQUEDA.forEach(
            (distancia) => {

                candidatas.push(
                    gusano.x - distancia
                );

                candidatas.push(
                    gusano.x + distancia
                );
            }
        );


        /*
         * Se ordenan de la más cercana a la más lejana: primero se
         * prueba lo que supone menos desplazamiento.
         */

        candidatas.sort(
            (a, b) => {

                return (
                    Math.abs(a - gusano.x) -
                    Math.abs(b - gusano.x)
                );
            }
        );


        let mejor = null;

        let probadas = 0;


        for (
            const candidataActual
            of candidatas
        ) {

            if (
                probadas >=
                MAX_POSICIONES_PROBADAS
            ) {

                break;
            }


            if (
                !Number.isFinite(
                    candidataActual
                )
            ) {

                continue;
            }


            if (
                this.esPosicionVisitada(
                    candidataActual
                )
            ) {

                continue;
            }


            const suelo =
                this.esPosicionValida(
                    gusano,
                    candidataActual
                );


            if (!suelo) {

                continue;
            }


            if (
                Math.abs(
                    suelo.x -
                    gusano.x
                ) < MOVIMIENTO_MINIMO
            ) {

                continue;
            }


            probadas++;


            const evaluacion =
                this.evaluarPosicionDeAtaque(
                    gusano,
                    objetivo,
                    suelo.x
                );


            if (!evaluacion) {

                continue;
            }


            if (
                !mejor ||
                evaluacion.puntuacion <
                    mejor.puntuacion
            ) {

                mejor = evaluacion;
            }
        }


        if (!mejor) {

            return null;
        }


        this.mejorPosicionAtaque = mejor;

        this.ultimaPosicionObjetivo = mejor.x;


        return mejor.x;
    }


    /**
     * Puntúa una posición candidata. Cuanto menor es la puntuación,
     * mejor es la posición.
     *
     * Se valora:
     *
     * - que exista una trayectoria de disparo libre
     * - que el disparo llegue cerca del objetivo
     * - que el desplazamiento no sea excesivo
     * - que no haya que caer demasiado
     * - que la posición se acerque al objetivo
     * - que no esté pegada a un borde del mapa
     *
     * @returns {object|null} Evaluación o null si la posición no sirve.
     */
    evaluarPosicionDeAtaque(
        gusano,
        objetivo,
        x
    ) {

        const suelo =
            this.esPosicionValida(
                gusano,
                x
            );


        if (!suelo) {

            return null;
        }


        /*
         * Se reutiliza el sistema de disparo existente.
         */

        const tiro =
            this.buscarMejorDisparo(

                gusano,

                objetivo,

                suelo.x
            );


        if (
            !tiro ||
            tiro.bloqueado
        ) {

            return null;
        }


        const movimiento =
            Math.abs(
                suelo.x -
                gusano.x
            );


        const distanciaObjetivo =
            Math.abs(
                objetivo.x -
                suelo.x
            );


        const cercaDelBorde =
            Math.min(
                suelo.x,
                this.juego.ancho - suelo.x
            );


        let puntuacion =
            tiro.distancia;


        puntuacion +=
            movimiento * 0.05;


        puntuacion +=
            suelo.desnivel * 0.20;


        puntuacion -=
            distanciaObjetivo * 0.02;


        if (
            cercaDelBorde < 60
        ) {

            puntuacion += 30;
        }


        return {

            x: suelo.x,

            puntuacion,

            distancia: movimiento,

            desnivel: suelo.desnivel,

            sueloY: suelo.y
        };
    }


    /**
     * Ajusta una coordenada X para que quede dentro del mapa.
     */
    ajustarDestinoAlMapa(x) {

        return limitar(

            x,

            MARGEN_BORDE_MAPA,

            this.juego.ancho - MARGEN_BORDE_MAPA
        );
    }


    /**
     * Busca la plataforma sobre la que quedaría apoyado el gusano si
     * estuviera en la coordenada X indicada.
     *
     * Solo se consideran superficies a la altura de los pies o más
     * bajas: así el gusano nunca intenta meterse dentro de una
     * plataforma más alta que él.
     *
     * @returns {object|null} Plataforma o null.
     */
    obtenerSueloEn(
        gusano,
        x
    ) {

        const pies =
            gusano.y +
            gusano.radio;

        let superficie = null;


        this.obtenerPlataformas().forEach(
            (plataforma) => {

                const dentroHorizontal =

                    x + gusano.radio >
                        plataforma.x &&

                    x - gusano.radio <
                        plataforma.x +
                        plataforma.ancho;


                if (!dentroHorizontal) {

                    return;
                }


                if (
                    plataforma.y <
                    pies - 2
                ) {

                    /*
                     * Está más alta que los pies:
                     * es un obstáculo, no suelo.
                     */

                    return;
                }


                if (
                    superficie === null ||
                    plataforma.y <
                        superficie.y
                ) {

                    superficie = plataforma;
                }
            }
        );


        return superficie;
    }


    /**
     * Comprueba si el gusano puede colocarse en la coordenada X.
     *
     * @returns {object|null} Suelo válido con desnivel o null.
     */
    esPosicionValida(
        gusano,
        x
    ) {

        if (
            !gusano ||
            !Number.isFinite(x)
        ) {

            return null;
        }


        const destino =
            this.ajustarDestinoAlMapa(x);


        const suelo =
            this.obtenerSueloEn(
                gusano,
                destino
            );


        if (!suelo) {

            return null;
        }


        if (suelo.y > 560) {

            /* Suelo bajo el agua: no es una posición segura. */

            return null;
        }


        return {

            x: destino,

            y: suelo.y,

            desnivel: Math.max(

                0,

                suelo.y -
                    (gusano.y + gusano.radio)
            )
        };
    }


    /**
     * Comprueba si el gusano puede seguir caminando en esa dirección
     * sin meterse dentro de una plataforma ni salirse del mapa.
     */
    puedeAvanzar(
        gusano,
        direccion
    ) {

        if (!gusano) {

            return false;
        }


        const paso =
            gusano.radio + 8;

        const xSiguiente =
            gusano.x +
            direccion * paso;


        if (

            xSiguiente < MARGEN_BORDE_MAPA ||

            xSiguiente >
                this.juego.ancho - MARGEN_BORDE_MAPA
        ) {

            return false;
        }


        const pies =
            gusano.y +
            gusano.radio;

        let hayPared = false;


        this.obtenerPlataformas().forEach(
            (plataforma) => {

                const dentroHorizontal =

                    xSiguiente + gusano.radio >
                        plataforma.x &&

                    xSiguiente - gusano.radio <
                        plataforma.x +
                        plataforma.ancho;


                if (!dentroHorizontal) {

                    return;
                }


                const esPared =

                    plataforma.y <
                        pies - 1 &&

                    pies <
                        plataforma.y +
                        plataforma.alto;


                if (esPared) {

                    hayPared = true;
                }
            }
        );


        return !hayPared;
    }


    /**
     * Acerca horizontalmente al gusano hacia el objetivo usando el
     * movimiento real del gusano.
     *
     * @returns {boolean} true si empezó a moverse.
     */
    moverseHaciaElObjetivo(
        gusano,
        objetivo
    ) {

        if (
            !gusano ||
            !objetivo
        ) {

            return false;
        }


        const direccion =
            objetivo.x >= gusano.x
                ? 1
                : -1;


        this.direccionAcercamiento =
            direccion;


        const distancias = [

            DISTANCIA_REPOSICION,

            80,

            50,

            MOVIMIENTO_MINIMO
        ];


        for (
            const distancia
            of distancias
        ) {

            const destino =
                gusano.x +
                direccion * distancia;


            if (
                this.prepararMovimientoA(
                    destino
                )
            ) {

                return true;
            }
        }


        return false;
    }


    /**
     * Guarda una posición como visitada para no repetirla.
     */
    registrarPosicionVisitada(x) {

        if (!Number.isFinite(x)) {

            return;
        }


        this.posicionesVisitadas.push(x);


        if (
            this.posicionesVisitadas.length > 12
        ) {

            this.posicionesVisitadas.shift();
        }
    }


    /**
     * Comprueba si una posición ya fue visitada recientemente.
     */
    esPosicionVisitada(x) {

        return this.posicionesVisitadas.some(
            (visitada) => {

                return (
                    Math.abs(visitada - x) <
                    TOLERANCIA_POSICION_REPETIDA
                );
            }
        );
    }


    /**
     * Detecta el movimiento inútil izquierda / derecha / izquierda.
     */
    movimientoOscilante() {

        const historial =
            this.historialDirecciones;


        if (historial.length < 4) {

            return false;
        }


        const ultimas =
            historial.slice(-4);


        return (

            ultimas[0] === ultimas[2] &&

            ultimas[1] === ultimas[3] &&

            ultimas[0] !== ultimas[1]
        );
    }


    // ========================================================
    // MOVIMIENTO FORZADO
    // ========================================================

    obtenerMovimientoForzado(
        gusano
    ) {

        const plataforma =
            this.buscarPlataformaActual(
                gusano
            );


        if (!plataforma) {

            return null;
        }


        const zona =
            this.obtenerZonaSegura(
                plataforma
            );


        /*
         * Si está a la izquierda,
         * lo mandamos a la derecha.
         *
         * Si está a la derecha,
         * lo mandamos a la izquierda.
         */

        const centro =
            (
                zona.inicio +
                zona.fin
            ) / 2;


        let direccion;


        if (
            gusano.x <= centro
        ) {

            direccion = 1;

        } else {

            direccion = -1;
        }


        let nuevaX =
            gusano.x +
            direccion *
            DISTANCIA_REPOSICION;


        nuevaX =
            limitar(

                nuevaX,

                zona.inicio,

                zona.fin
            );


        if (
            Math.abs(
                nuevaX -
                gusano.x
            ) < MOVIMIENTO_MINIMO
        ) {

            /*
             * Si ese lado no sirve,
             * usamos el extremo contrario.
             */

            nuevaX =
                direccion > 0
                    ? zona.inicio
                    : zona.fin;
        }


        if (
            Math.abs(
                nuevaX -
                gusano.x
            ) < MOVIMIENTO_MINIMO
        ) {

            return null;
        }


        this.ultimaPosicionObjetivo =
            nuevaX;


        return nuevaX;
    }


    // ========================================================
    // PREPARAR MOVIMIENTO NORMAL
    // ========================================================

    /**
     * Movimiento lateral de respaldo.
     *
     * Se mantiene como último recurso: obliga al gusano a moverse
     * realmente (izquierda o derecha) en lugar de quedarse quieto.
     */
    prepararMovimiento() {

        const gusano =
            this.gusanoActual;


        if (
            !gusano ||
            !gusano.vivo
        ) {

            return;
        }


        const objetivo =
            this.objetivoActual ||
            this.seleccionarObjetivo();


        if (!objetivo) {

            return;
        }


        this.buscarPosicionYMoverse(
            gusano,
            objetivo
        );
    }


    // ========================================================
    // PREPARAR MOVIMIENTO A X
    // ========================================================

    /**
     * Inicia un desplazamiento REAL hacia la coordenada X indicada.
     *
     * La posición se valida antes (dentro del mapa, con terreno seguro
     * debajo y sin meterse dentro de una plataforma). El gusano camina
     * con gusano.mover(-1) / gusano.mover(1) hasta llegar.
     *
     * @returns {boolean} true si el gusano empezó a moverse.
     */
    prepararMovimientoA(
        posicion
    ) {

        const gusano =
            this.gusanoActual;


        if (
            !gusano ||
            !gusano.vivo
        ) {

            return false;
        }


        const suelo =
            this.esPosicionValida(
                gusano,
                posicion
            );


        if (!suelo) {

            /*
             * No hay terreno seguro: no se mueve ahí.
             */

            return false;
        }


        const diferencia =
            suelo.x -
            gusano.x;


        if (
            Math.abs(diferencia) < 10
        ) {

            /*
             * Ya está prácticamente encima:
             * no merece un desplazamiento.
             */

            this.registrarPosicionVisitada(
                gusano.x
            );

            return false;
        }


        this.puntoMovimiento =
            suelo.x;


        this.direccionMovimiento =
            diferencia < 0
                ? -1
                : 1;


        this.historialDirecciones.push(
            this.direccionMovimiento
        );


        if (
            this.historialDirecciones.length > 6
        ) {

            this.historialDirecciones.shift();
        }


        this.estado =
            "moviendo";


        this.temporizador = 0;


        /*
         * MOVER REALMENTE AL GUSANO.
         */

        if (gusano.mover) {

            gusano.mover(
                this.direccionMovimiento
            );
        }


        return true;
    }


    // ========================================================
    // ACTUALIZAR MOVIMIENTO
    // ========================================================

    actualizarMovimiento() {

        const gusano =
            this.gusanoActual;


        if (
            !gusano ||
            !gusano.vivo
        ) {

            if (gusano && gusano.detener) {

                gusano.detener();
            }


            this.estado =
                "inactivo";

            return;
        }


        if (
            this.puntoMovimiento === null
        ) {

            if (gusano.detener) {

                gusano.detener();
            }


            this.estado =
                "pensando";

            this.temporizador =
                0.12;

            return;
        }


        const diferencia =
            this.puntoMovimiento -
            gusano.x;


        /*
         * LLEGÓ A LA POSICIÓN:
         * se vuelve a calcular el disparo desde ahí.
         */

        if (
            Math.abs(diferencia) <= 8
        ) {

            if (gusano.detener) {

                gusano.detener();
            }


            this.registrarPosicionVisitada(
                gusano.x
            );


            this.puntoMovimiento = null;


            this.estado =
                "pensando";

            this.temporizador =
                0.12;

            return;
        }


        this.direccionMovimiento =
            diferencia < 0
                ? -1
                : 1;


        /*
         * No caminar hacia una pared: si el siguiente paso mete al
         * gusano dentro de una plataforma, se detiene y vuelve a
         * analizar desde la posición alcanzada.
         */

        if (
            !this.puedeAvanzar(
                gusano,
                this.direccionMovimiento
            )
        ) {

            if (gusano.detener) {

                gusano.detener();
            }


            this.registrarPosicionVisitada(
                gusano.x
            );


            this.puntoMovimiento = null;


            this.estado =
                "pensando";

            this.temporizador =
                0.12;

            return;
        }


        /*
         * MOVER REALMENTE AL GUSANO.
         */

        if (gusano.mover) {

            gusano.mover(
                this.direccionMovimiento
            );
        }


        this.temporizador =
            0.08;
    }


    // ========================================================
    // ORIGEN DEL PROYECTIL
    // ========================================================

    obtenerOrigenProyectil(

        gusano,

        angulo,

        direccion,

        posicionX = null

    ) {

        const radianes =
            angulo *
            Math.PI /
            180;


        const longitud =
            gusano.canon?.longitud ||
            32;


        const x =
            posicionX === null
                ? gusano.x
                : posicionX;


        return {

            x:
                x +

                Math.cos(
                    radianes
                ) *

                longitud *

                direccion,

            y:
                gusano.y -

                Math.sin(
                    radianes
                ) *

                longitud
        };
    }


    // ========================================================
    // COMPROBAR SI UN PUNTO ESTÁ DENTRO
    // ========================================================

    puntoDentroRectangulo(
        x,
        y,
        rectangulo
    ) {

        return (

            x >= rectangulo.x &&

            x <=
                rectangulo.x +
                rectangulo.ancho &&

            y >= rectangulo.y &&

            y <=
                rectangulo.y +
                rectangulo.alto
        );
    }


    // ========================================================
    // DISTANCIA DE PUNTO A SEGMENTO
    // ========================================================

    distanciaPuntoSegmento(

        px,
        py,

        x1,
        y1,

        x2,
        y2

    ) {

        const dx =
            x2 - x1;


        const dy =
            y2 - y1;


        if (
            dx === 0 &&
            dy === 0
        ) {

            return Math.hypot(
                px - x1,
                py - y1
            );
        }


        const t =
            limitar(

                (
                    (px - x1) * dx +
                    (py - y1) * dy
                )

                /

                (
                    dx * dx +
                    dy * dy
                ),

                0,
                1
            );


        const cercanoX =
            x1 +
            t * dx;


        const cercanoY =
            y1 +
            t * dy;


        return Math.hypot(

            px -
            cercanoX,

            py -
            cercanoY
        );
    }


    // ========================================================
    // SEGMENTO CRUZA PLATAFORMA
    // ========================================================

    segmentoCruzaPlataforma(

        x1,
        y1,

        x2,
        y2,

        plataforma

    ) {

        /*
         * Primero ampliamos ligeramente
         * el bloque por el radio del proyectil.
         */

        const rect = {

            x:
                plataforma.x -
                RADIO_PROYECTIL,

            y:
                plataforma.y -
                RADIO_PROYECTIL,

            ancho:
                plataforma.ancho +
                RADIO_PROYECTIL * 2,

            alto:
                plataforma.alto +
                RADIO_PROYECTIL * 2
        };


        /*
         * Si alguno de los extremos está
         * dentro del bloque.
         */

        if (
            this.puntoDentroRectangulo(
                x1,
                y1,
                rect
            )
        ) {

            return true;
        }


        if (
            this.puntoDentroRectangulo(
                x2,
                y2,
                rect
            )
        ) {

            return true;
        }


        /*
         * Comprobamos las cuatro esquinas.
         */

        const esquinas = [

            {
                x: rect.x,
                y: rect.y
            },

            {
                x:
                    rect.x +
                    rect.ancho,

                y: rect.y
            },

            {
                x: rect.x,

                y:
                    rect.y +
                    rect.alto
            },

            {
                x:
                    rect.x +
                    rect.ancho,

                y:
                    rect.y +
                    rect.alto
            }
        ];


        /*
         * Si el segmento pasa suficientemente
         * cerca de alguna esquina.
         */

        for (
            const esquina of esquinas
        ) {

            if (
                this.distanciaPuntoSegmento(

                    esquina.x,

                    esquina.y,

                    x1,

                    y1,

                    x2,

                    y2

                ) <= RADIO_PROYECTIL
            ) {

                return true;
            }
        }


        /*
         * Comprobar intersección con
         * los bordes del rectángulo.
         */

        const bordes = [

            [
                rect.x,
                rect.y,

                rect.x +
                    rect.ancho,
                rect.y
            ],

            [
                rect.x +
                    rect.ancho,
                rect.y,

                rect.x +
                    rect.ancho,

                rect.y +
                    rect.alto
            ],

            [
                rect.x +
                    rect.ancho,

                rect.y +
                    rect.alto,

                rect.x,

                rect.y +
                    rect.alto
            ],

            [
                rect.x,
                rect.y +
                    rect.alto,

                rect.x,
                rect.y
            ]
        ];


        for (
            const borde of bordes
        ) {

            if (
                this.segmentosIntersectan(

                    x1,
                    y1,

                    x2,
                    y2,

                    borde[0],
                    borde[1],

                    borde[2],
                    borde[3]
                )
            ) {

                return true;
            }
        }


        return false;
    }


    // ========================================================
    // INTERSECCIÓN DE SEGMENTOS
    // ========================================================

    segmentosIntersectan(

        x1,
        y1,

        x2,
        y2,

        x3,
        y3,

        x4,
        y4

    ) {

        const denominador =

            (
                y4 - y3
            ) *
            (
                x2 - x1
            )

            -

            (
                x4 - x3
            ) *
            (
                y2 - y1
            );


        if (
            Math.abs(
                denominador
            ) < 0.00001
        ) {

            return false;
        }


        const ua =

            (

                (
                    x4 - x3
                ) *
                (
                    y1 - y3
                )

                -

                (
                    y4 - y3
                ) *
                (
                    x1 - x3
                )

            )

            /

            denominador;


        const ub =

            (

                (
                    x2 - x1
                ) *
                (
                    y1 - y3
                )

                -

                (
                    y2 - y1
                ) *
                (
                    x1 - x3
                )

            )

            /

            denominador;


        return (

            ua >= 0 &&
            ua <= 1 &&

            ub >= 0 &&
            ub <= 1
        );
    }


    // ========================================================
    // SIMULAR TRAYECTORIA
    // ========================================================

    simularTrayectoria(

        gusano,

        objetivo,

        angulo,

        potencia,

        direccion,

        posicionX = null

    ) {

        const radianes =
            angulo *
            Math.PI /
            180;


        const origen =
            this.obtenerOrigenProyectil(

                gusano,

                angulo,

                direccion,

                posicionX
            );


        let x =
            origen.x;


        let y =
            origen.y;


        let velocidadX =

            Math.cos(
                radianes
            ) *

            potencia *

            direccion;


        let velocidadY =

            -Math.sin(
                radianes
            ) *

            potencia;


        let distanciaMinima =
            Infinity;


        const paso =
            1 / 60;


        for (
            let tiempo = 0;

            tiempo < 6;

            tiempo += paso
        ) {

            const anteriorX =
                x;

            const anteriorY =
                y;


            // Viento.
            velocidadX +=

                (this.juego.viento || 0) *

                paso *

                ACELERACION_VIENTO_PROYECTIL;


            // Gravedad.
            velocidadY +=

                GRAVEDAD_PROYECTIL *
                paso;


            // Movimiento.
            x +=
                velocidadX *
                paso;


            y +=
                velocidadY *
                paso;


            // Distancia al objetivo.
            const distancia =
                Math.hypot(

                    x -
                    objetivo.x,

                    y -
                    objetivo.y
                );


            if (
                distancia <
                distanciaMinima
            ) {

                distanciaMinima =
                    distancia;
            }


            // ------------------------------------------------
            // PRIMERO: OBJETIVO
            // ------------------------------------------------

            if (
                distancia <=
                DISTANCIA_IMPACTO
            ) {

                return {

                    distancia:
                        distanciaMinima,

                    bloqueado:
                        false
                };
            }


            // ------------------------------------------------
            // SEGUNDO: BLOQUES
            // ------------------------------------------------

            const plataformas =
                this.obtenerPlataformas();


            for (
                const plataforma
                of plataformas
            ) {

                if (
                    this.segmentoCruzaPlataforma(

                        anteriorX,
                        anteriorY,

                        x,
                        y,

                        plataforma
                    )
                ) {

                    return {

                        distancia:
                            distanciaMinima,

                        bloqueado:
                            true
                    };
                }
            }


            // ------------------------------------------------
            // FUERA DEL MAPA
            // ------------------------------------------------

            if (

                x < -100 ||

                x >
                    (this.juego.ancho ||
                        1200) +
                    100 ||

                y >
                    (this.juego.alto ||
                        800) +
                    100
            ) {

                break;
            }
        }


        return {

            distancia:
                distanciaMinima,

            bloqueado:
                false
        };
    }


    // ========================================================
    // BUSCAR MEJOR DISPARO
    // ========================================================

    buscarMejorDisparo(

        gusano,

        objetivo,

        posicionX = null

    ) {

        if (
            !gusano ||
            !objetivo
        ) {

            return null;
        }


        const xOrigen =
            posicionX === null
                ? gusano.x
                : posicionX;


        const direccion =

            objetivo.x >=
            xOrigen

                ? 1
                : -1;


        let mejorLibre =
            null;


        let mejorBloqueado =
            null;


        for (

            let angulo =
                ANGULO_MINIMO;

            angulo <=
                ANGULO_MAXIMO;

            angulo += 3

        ) {


            for (

                let potencia =
                    POTENCIA_MINIMA;

                potencia <=
                    POTENCIA_MAXIMA;

                potencia += 15

            ) {

                const resultado =
                    this.simularTrayectoria(

                        gusano,

                        objetivo,

                        angulo,

                        potencia,

                        direccion,

                        posicionX
                    );


                const candidato = {

                    angulo,

                    potencia,

                    direccion,

                    distancia:
                        resultado.distancia,

                    bloqueado:
                        resultado.bloqueado
                };


                // ------------------------------------------------
                // TRAYECTORIA LIBRE
                // ------------------------------------------------

                if (
                    !resultado.bloqueado
                ) {

                    if (
                        !mejorLibre ||
                        candidato.distancia <
                            mejorLibre.distancia
                    ) {

                        mejorLibre =
                            candidato;
                    }


                    if (
                        candidato.distancia <=
                        DISTANCIA_IMPACTO
                    ) {

                        return candidato;
                    }
                }


                // ------------------------------------------------
                // TRAYECTORIA BLOQUEADA
                // ------------------------------------------------

                else {

                    if (
                        !mejorBloqueado ||
                        candidato.distancia <
                            mejorBloqueado.distancia
                    ) {

                        mejorBloqueado =
                            candidato;
                    }
                }
            }
        }


        /*
         * SI EXISTE UNA TRAYECTORIA LIBRE:
         * devolverla.
         */

        if (
            mejorLibre
        ) {

            return mejorLibre;
        }


        /*
         * Si todo está bloqueado:
         * devolver el bloqueo para que
         * la IA SE MUEVA.
         */

        return mejorBloqueado;
    }


    // ========================================================
    // PREPARAR DISPARO
    // ========================================================

    prepararDisparo() {

        if (
            this.gusanoActual &&
            this.gusanoActual.detener
        ) {

            this.gusanoActual.detener();
        }


        this.estado =
            "apuntando";


        this.temporizador =
            0.15;
    }


    // ========================================================
    // DISPARAR
    // ========================================================

    dispararAlObjetivo() {

        const gusano =
            this.gusanoActual;


        // Cada gusano puede disparar una sola vez por turno.
        if (
            !gusano ||
            gusano.disparoRealizado
        ) {
            this.estado = "esperandoTiempo";
            return;
        }


        if (
            !gusano ||
            !gusano.vivo
        ) {

            this.finalizarTurno();

            return;
        }


        const objetivo =
            this.seleccionarObjetivo();


        if (!objetivo) {

            this.finalizarTurno();

            return;
        }


        this.objetivoActual =
            objetivo;


        /*
         * VOLVER A COMPROBAR
         * DESDE LA POSICIÓN REAL.
         */

        const solucion =
            this.buscarMejorDisparo(

                gusano,

                objetivo,

                gusano.x
            );


        if (!solucion) {

            this.estado =
                "pensando";

            this.temporizador =
                0.15;

            return;
        }


        /*
         * ABSOLUTAMENTE IMPORTANTE:
         *
         * SI ESTÁ BLOQUEADO:
         *
         * NO DISPARAR.
         *
         * VOLVER A BUSCAR POSICIÓN.
         */

        if (
            solucion.bloqueado
        ) {

            this.estado =
                "pensando";

            this.temporizador =
                0.05;

            return;
        }


        const config =
            this.obtenerConfiguracion();


        const errorAngulo =

            (
                Math.random() * 2 -
                1
            ) *

            config.errorAngulo;


        const errorPotencia =

            (
                Math.random() * 2 -
                1
            ) *

            config.errorPotencia;


        const anguloFinal =
            limitar(

                solucion.angulo +
                errorAngulo,

                ANGULO_MINIMO,

                ANGULO_MAXIMO
            );


        const potenciaFinal =
            limitar(

                solucion.potencia +
                errorPotencia,

                POTENCIA_MINIMA,

                POTENCIA_MAXIMA
            );


        gusano.direccion =
            solucion.direccion;


        if (
            gusano.canon
        ) {

            gusano.canon.angulo =
                anguloFinal;

            gusano.canon.potencia =
                potenciaFinal;
        }


        const proyectil =

            gusano.canon
                ? gusano.canon.disparar()
                : null;


        if (!proyectil) {

            this.finalizarTurno();

            return;
        }


        proyectil.viento =
            this.juego.viento;


        if (
            this.juego.proyectiles
        ) {

            this.juego.proyectiles.push(
                proyectil
            );
        }


        this.haDisparado =
            true;

        gusano.disparoRealizado = true;


        this.ultimoDisparo = {

            objetivo,

            angulo:
                anguloFinal,

            potencia:
                potenciaFinal
        };


        this.estado =
            "esperandoProyectil";


        this.temporizador =
            0;
    }


    // ========================================================
    // COMPROBAR FIN DEL DISPARO
    // ========================================================

    comprobarFinDisparo() {

        const proyectiles =
            this.juego.proyectiles ||
            [];


        const explosiones =
            this.juego.explosiones ||
            [];


        const hayProyectil =
            proyectiles.some(
                p =>
                    p.activo
            );


        const hayExplosion =
            explosiones.some(
                e =>
                    e.activa
            );


        if (
            !hayProyectil &&
            !hayExplosion
        ) {

            this.estado =
                "esperandoTiempo";


            this.temporizador =
                0.90;
        }
    }


    // ========================================================
    // FINALIZAR TURNO
    // ========================================================

    finalizarTurno() {

        this.estado =
            "inactivo";


        if (
            this.gusanoActual &&
            this.gusanoActual.detener
        ) {

            this.gusanoActual.detener();
        }


        this.gusanoActual =
            null;


        if (
            this.juego
        ) {

            this.juego.turnoFinalizado =
                true;
        }
    }
}
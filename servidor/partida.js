/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Motor autoritativo de partida
 * =========================================================
 *
 * El servidor es la ÚNICA autoridad de la partida: aquí viven la posición,
 * la vida, los disparos, el daño, las muertes, el turno, el viento, el
 * terreno destruido y el ganador. El cliente solo envía INTENCIONES
 * (moverse, apuntar, cargar, disparar) y dibuja lo que el servidor confirma.
 *
 * Mecánicas conservadas del juego original:
 *  - Gravedad 900 px/s², velocidad 140 px/s, salto 300 px/s.
 *  - Potencia de 250 a 620 (+280/s mientras se mantiene el clic).
 *  - Ángulo de -80° a +80°.
 *  - Proyectil con gravedad 500 px/s² afectado por el viento.
 *  - Explosión de radio 60 (terreno) / 65 (personaje) con daño
 *    100 * (1 - distancia / radio).
 *  - Muerte al caer al agua (y > 560).
 *  - Turnos que SOLO cierran el turno. La duración vive en un único sitio,
 *    CONFIG.DURACION_TURNO (hoy 12 segundos), y viaja al cliente en cada
 *    paquete de estado para que el reloj del HUD use la misma.
 *
 * Cambios justificados respecto al original:
 *  - El terreno ahora es destruible de verdad (cráteres en la rejilla).
 *  - El turno avanza 1 segundo después de resolverse el disparo en lugar de
 *    esperar a que el cronómetro llegue a cero: con seis jugadores humanos
 *    esperar el turno completo en cada jugada haría la partida lenta.
 *  - La partida termina cuando queda un único superviviente (antes eran dos
 *    equipos; ahora son seis jugadores en batalla libre).
 *  - DOBLE SALTO de los pollos: cada jugador puede dar DOS saltos antes de
 *    volver a tocar una superficie (ESPACIO en el suelo y ESPACIO otra vez en
 *    el aire). Los dos saltos usan la MISMA fuerza (CONFIG.FUERZA_SALTO) y el
 *    límite está en CONFIG.SALTOS_MAXIMOS. El contador se reinicia al
 *    aterrizar sobre cualquier superficie válida y solo afecta a los pollos
 *    (jugadores): ningún otro personaje usa esta mecánica.
 */

const CONFIG = require("./config");
const Terreno = require("./terreno");

class Partida {
    /**
     * @param {Array} jugadoresSala Jugadores de la sala (id, nombre, personaje, indice).
     */
    constructor(jugadoresSala) {
        this.numero = 1;
        this.estado = "jugando";
        this.terreno = new Terreno();
        this.crateres = []; // Historial completo de cráteres de la partida.
        this.crateresNuevos = []; // Cráteres pendientes de enviar en el estado.
        this.viento = CONFIG.VIENTO_INICIAL;
        this.jugadores = new Map(); // idSocket -> estado autoritativo del jugador.
        this.orden = []; // Ids en orden de turno (orden de entrada a la sala).
        this.indiceTurno = 0;
        this.turno = null;
        this.tiempoTurno = CONFIG.DURACION_TURNO;
        this.numeroTurno = 0;
        this.proyectiles = [];
        this.explosiones = [];
        this.eventos = [];
        this.retardoFinTurno = 0;
        this.disparoEnVuelo = false;
        this.ganador = null;
        this.motivoFinal = null;

        this.sincronizarJugadores(jugadoresSala);
        this.iniciarPartida();
        this.registrarEvento({ tipo: "inicio-partida" });
    }

    /**
     * Crea o actualiza el estado de juego de cada jugador de la sala.
     * Al reiniciar la partida se conservan las estadísticas acumuladas.
     *
     * @param {Array} jugadoresSala Jugadores del lobby.
     */
    sincronizarJugadores(jugadoresSala) {
        const idsSala = jugadoresSala.map((jugador) => jugador.id);

        // Los jugadores que ya no están en la sala desaparecen del campo.
        [...this.jugadores.keys()].forEach((id) => {
            if (!idsSala.includes(id)) {
                this.jugadores.delete(id);
            }
        });

        jugadoresSala.forEach((datos) => {
            const anterior = this.jugadores.get(datos.id);

            this.jugadores.set(datos.id, {
                id: datos.id,
                nombre: datos.nombre,
                personaje: datos.personaje,
                indice: datos.indice,
                x: anterior ? anterior.x : 0,
                y: anterior ? anterior.y : 0,
                vx: 0,
                vy: 0,
                vida: CONFIG.VIDA_MAXIMA,
                vivo: true,
                conectado: true,
                direccion: datos.indice < 3 ? 1 : -1,
                angulo: CONFIG.ANGULO_INICIAL,
                potencia: CONFIG.POTENCIA_MINIMA,
                cargando: false,
                enSuelo: false,
                /**
                 * Tipo de personaje. Los jugadores son POLLOS y son los únicos
                 * que pueden dar el doble salto (ver saltosMaximosDe()).
                 */
                tipo: "pollo",
                /** Saltos gastados desde el último aterrizaje (doble salto). */
                saltosRealizados: 0,
                /** Estado anterior de ESPACIO: se salta al PULSAR, no al mantener. */
                saltoMantenido: false,
                movimiento: 0,
                disparoRealizado: false,
                animacion: "idle",
                tiempoAnimacion: 0,
                estadisticas: anterior
                    ? anterior.estadisticas
                    : { disparos: 0, danioInfligido: 0, bajas: 0, muertes: 0 }
            });
        });

        this.orden = [...this.jugadores.values()]
            .sort((a, b) => a.indice - b.indice)
            .map((jugador) => jugador.id);
    }

    /**
     * Devuelve la lista de jugadores como array.
     */
    listaJugadores() {
        return [...this.jugadores.values()];
    }

    /**
     * Jugadores vivos (misma condición que usaba el motor original).
     */
    vivos() {
        return this.listaJugadores().filter((jugador) => jugador.vivo && jugador.vida > 0);
    }

    /**
     * Jugador que tiene el turno ahora mismo, o null.
     */
    jugadorConTurno() {
        if (!this.turno) {
            return null;
        }

        const jugador = this.jugadores.get(this.turno);

        if (!jugador || !jugador.vivo || !jugador.conectado) {
            return null;
        }

        return jugador;
    }

    /**
     * Genera posiciones iniciales separadas y apoyadas sobre plataformas.
     *
     * Es el mismo algoritmo del original: se construyen candidatos sobre la
     * superficie de cada plataforma y se eligen al azar exigiendo una
     * distancia mínima de 72 px entre personajes, de modo que dos jugadores
     * nunca aparecen exactamente encima del otro ni en el agua.
     */
    colocarJugadores() {
        const radio = CONFIG.RADIO_PERSONAJE;
        const candidatos = [];

        this.terreno.plataformas.forEach((plataforma) => {
            const margen = radio + 8;
            const inicio = plataforma.x + margen;
            const final = plataforma.x + plataforma.ancho - margen;

            if (final <= inicio) {
                return;
            }

            const separaciones = Math.max(2, Math.floor((final - inicio) / 45));

            for (let indice = 0; indice <= separaciones; indice++) {
                const proporcion = indice / separaciones;
                candidatos.push({
                    x: inicio + (final - inicio) * proporcion,
                    y: plataforma.y - radio
                });
            }
        });

        candidatos.sort(() => Math.random() - 0.5);

        const posiciones = [];
        const distanciaMinima = 72;

        this.listaJugadores().forEach((jugador) => {
            const disponibles = candidatos.filter((candidato) => {
                return posiciones.every((posicion) => {
                    return Math.hypot(candidato.x - posicion.x, candidato.y - posicion.y) >= distanciaMinima;
                });
            });

            const opciones = disponibles.length ? disponibles : candidatos;
            const posicion = opciones[Math.floor(Math.random() * opciones.length)];

            posiciones.push(posicion);
            jugador.x = posicion.x;
            jugador.y = posicion.y;
            jugador.vx = 0;
            jugador.vy = 0;
            jugador.enSuelo = false;
            jugador.saltosRealizados = 0;
            jugador.direccion = posicion.x < CONFIG.ANCHO / 2 ? 1 : -1;
        });
    }

    /**
     * Prepara (o reinicia) la partida con los jugadores actuales.
     */
    iniciarPartida() {
        this.estado = "jugando";
        this.terreno.reconstruir();
        this.crateres = [];
        this.crateresNuevos = [];
        this.viento = CONFIG.VIENTO_INICIAL;
        this.proyectiles = [];
        this.explosiones = [];
        this.retardoFinTurno = 0;
        this.disparoEnVuelo = false;
        this.ganador = null;
        this.motivoFinal = null;
        this.numeroTurno = 0;

        this.listaJugadores().forEach((jugador) => {
            jugador.vida = CONFIG.VIDA_MAXIMA;
            jugador.vivo = true;
            jugador.vx = 0;
            jugador.vy = 0;
            jugador.angulo = CONFIG.ANGULO_INICIAL;
            jugador.potencia = CONFIG.POTENCIA_MINIMA;
            jugador.cargando = false;
            jugador.movimiento = 0;
            jugador.disparoRealizado = false;
            // El doble salto arranca limpio en cada partida (y en cada revancha).
            jugador.saltosRealizados = 0;
            jugador.saltoMantenido = false;
            jugador.animacion = "idle";
            jugador.tiempoAnimacion = 0;
            jugador.estadisticas.disparos = 0;
            jugador.estadisticas.danioInfligido = 0;
            jugador.estadisticas.bajas = 0;
            jugador.estadisticas.muertes = 0;
        });

        this.colocarJugadores();
        this.asignarTurno(0);
    }

    /**
     * Prepara una revancha con los mismos jugadores de la sala.
     *
     * @param {Array} jugadoresSala Jugadores actuales del lobby.
     * @returns {object} Paquete inicial completo (mundo + cráteres).
     */
    reiniciar(jugadoresSala) {
        this.numero += 1;
        this.sincronizarJugadores(jugadoresSala);
        this.iniciarPartida();
        this.registrarEvento({ tipo: "inicio-partida" });
        return this.instantaneaInicial();
    }

    /**
     * Añade un evento al lote que se enviará en el próximo paquete de estado.
     * Los eventos son la única fuente de verdad para efectos y sonidos.
     *
     * @param {object} evento Evento del juego.
     */
    registrarEvento(evento) {
        this.eventos.push(evento);

        // Límite de seguridad: nunca se acumula una lista gigante.
        if (this.eventos.length > 60) {
            this.eventos.splice(0, this.eventos.length - 60);
        }
    }
    /**
     * Entrega el turno al jugador que ocupa una posición del orden.
     *
     * @param {number} indice Posición en this.orden.
     */
    asignarTurno(indice) {
        this.indiceTurno = indice;
        const id = this.orden[indice];
        const jugador = id ? this.jugadores.get(id) : null;

        if (!jugador || !jugador.vivo || !jugador.conectado) {
            this.turno = null;
            this.avanzarTurno();
            return;
        }

        // Ningún personaje conserva movimiento ni carga entre turnos.
        this.listaJugadores().forEach((otro) => {
            otro.vx = 0;
            otro.movimiento = 0;
            otro.cargando = false;
            otro.potencia = CONFIG.POTENCIA_MINIMA;
        });

        this.turno = jugador.id;
        this.tiempoTurno = CONFIG.DURACION_TURNO;
        this.numeroTurno += 1;
        this.retardoFinTurno = 0;
        this.disparoEnVuelo = false;
        jugador.disparoRealizado = false;
        jugador.cargando = false;
        jugador.potencia = CONFIG.POTENCIA_MINIMA;
        jugador.tiempoAnimacion = 0;
        jugador.animacion = "idle";

        this.registrarEvento({ tipo: "turno", jugadorId: jugador.id, nombre: jugador.nombre });
    }

    /**
     * Pasa el turno al siguiente jugador vivo y conectado.
     *
     * Los jugadores muertos o desconectados se saltan siempre (igual que el
     * motor original saltaba a los personajes eliminados).
     */
    avanzarTurno() {
        const total = this.orden.length;

        for (let salto = 1; salto <= total; salto++) {
            const indice = (this.indiceTurno + salto) % total;
            const jugador = this.jugadores.get(this.orden[indice]);

            if (jugador && jugador.vivo && jugador.conectado) {
                this.asignarTurno(indice);
                return;
            }
        }

        // No queda nadie que pueda jugar: se cierra el turno y se revisa el final.
        this.turno = null;
        this.comprobarFinPartida();
    }

    /**
     * Comprueba si un jugador puede ejecutar acciones (moverse, apuntar, disparar).
     *
     * Es la validación autoritativa: solo el jugador con el turno, vivo,
     * conectado y que no haya disparado todavía puede actuar.
     *
     * @param {object} jugador Estado del jugador.
     * @returns {boolean}
     */
    puedeActuar(jugador) {
        if (this.estado !== "jugando" || !jugador) {
            return false;
        }

        if (!jugador.vivo || !jugador.conectado) {
            return false;
        }

        if (jugador.id !== this.turno || jugador.disparoRealizado) {
            return false;
        }

        return true;
    }
    /**
     * Aplica la intención de entrada de un jugador (movimiento, salto y ángulo).
     *
     * @param {string} idJugador Id del socket que envía la entrada.
     * @param {object} datos { direccion, saltar, angulo }.
     * @returns {boolean} true si la entrada fue aceptada.
     */
    entrada(idJugador, datos) {
        const jugador = this.jugadores.get(idJugador);

        if (!this.puedeActuar(jugador) || !datos) {
            return false;
        }

        if (Number.isFinite(datos.direccion)) {
            const direccion = Math.max(-1, Math.min(1, Math.sign(datos.direccion)));
            jugador.movimiento = direccion;
            if (direccion !== 0) {
                jugador.direccion = direccion;
            }
        }

        if (typeof datos.saltar === "boolean") {
            /**
             * ESPACIO se aplica al PULSAR, no al mantener.
             *
             * El cliente manda el estado de la tecla (pulsada o no) en cada
             * entrada, así que aquí se compara con el estado anterior: mantener
             * la tecla no gasta el segundo salto ni repite saltos al aterrizar.
             */
            const pulsacion = datos.saltar && !jugador.saltoMantenido;

            jugador.saltoMantenido = datos.saltar;

            if (pulsacion) {
                this.saltar(jugador);
            }
        }

        if (Number.isFinite(datos.angulo)) {
            jugador.angulo = Math.max(-CONFIG.ANGULO_MAXIMO, Math.min(CONFIG.ANGULO_MAXIMO, Number(datos.angulo)));
        }

        return true;
    }

    /**
     * Saltos que puede dar un personaje antes de volver a tocar una superficie.
     *
     * Solo los POLLOS (los jugadores) tienen el doble salto: cualquier otro tipo
     * de personaje (gusanos, enemigos...) se queda con un único salto, así que
     * esta mecánica nunca se aplica "de rebote" a otros personajes.
     *
     * @param {object} jugador Estado del jugador.
     * @returns {number}
     */
    saltosMaximosDe(jugador) {
        return jugador.tipo === "pollo" ? CONFIG.SALTOS_MAXIMOS : 1;
    }

    /**
     * Hace saltar a un pollo (doble salto incluido).
     *
     * Reglas:
     *  - En el suelo el contador vale 0: ESPACIO hace el PRIMER salto.
     *  - En el aire con un salto gastado: ESPACIO hace el SEGUNDO salto.
     *  - Con los dos gastados: ESPACIO no hace nada (no hay tercer salto).
     *  - Al aterrizar sobre una superficie válida el contador vuelve a 0: se
     *    reinicia en aplicarGravedad (aterrizaje) y en los escalones de
     *    moverHorizontal, que son las DOS únicas formas de tocar suelo del
     *    juego. Nada de comparar con "y === posición inicial": funciona igual
     *    sobre terreno, plataformas y bloques de cualquier altura.
     *
     * Los dos saltos usan la misma fuerza (CONFIG.FUERZA_SALTO) y la misma
     * animación ("salto"), así que el cliente no necesita nada nuevo.
     *
     * @param {object} jugador Estado del jugador.
     */
    saltar(jugador) {
        if (jugador.saltosRealizados >= this.saltosMaximosDe(jugador)) {
            return;
        }

        jugador.vy = -CONFIG.FUERZA_SALTO;
        jugador.enSuelo = false;
        jugador.saltosRealizados += 1;
        jugador.animacion = "salto";
        this.registrarEvento({ tipo: "salto", jugadorId: jugador.id });
    }

    /**
     * Activa o desactiva la carga del cañón (mientras se mantiene el clic).
     *
     * @param {string} idJugador Id del socket.
     * @param {boolean} activo true al presionar, false al soltar.
     * @returns {boolean} true si la orden fue aceptada.
     */
    cargar(idJugador, activo) {
        const jugador = this.jugadores.get(idJugador);

        if (!this.puedeActuar(jugador)) {
            return false;
        }

        jugador.cargando = Boolean(activo);

        if (!jugador.cargando && jugador.potencia < CONFIG.POTENCIA_MINIMA) {
            jugador.potencia = CONFIG.POTENCIA_MINIMA;
        }

        return true;
    }

    /**
     * Dispara el proyectil del jugador con turno usando SU potencia y SU ángulo.
     *
     * Fórmulas idénticas al Cañón original: el proyectil sale de la punta del
     * cañón con velocidad (cos, -sin) * potencia * dirección.
     *
     * @param {string} idJugador Id del socket.
     * @returns {boolean} true si el disparo se realizó.
     */
    disparar(idJugador) {
        const jugador = this.jugadores.get(idJugador);

        if (!this.puedeActuar(jugador)) {
            return false;
        }

        const potencia = Math.max(CONFIG.POTENCIA_MINIMA, Math.min(CONFIG.POTENCIA_MAXIMA, jugador.potencia));
        const radianes = (jugador.angulo * Math.PI) / 180;
        const salidaX = jugador.x + Math.cos(radianes) * CONFIG.LONGITUD_CANON * jugador.direccion;
        const salidaY = jugador.y - Math.sin(radianes) * CONFIG.LONGITUD_CANON;

        this.proyectiles.push({
            id: `${jugador.id}-${this.numeroTurno}-${this.proyectiles.length}`,
            duenoId: jugador.id,
            x: salidaX,
            y: salidaY,
            vx: Math.cos(radianes) * potencia * jugador.direccion,
            vy: -Math.sin(radianes) * potencia
        });

        jugador.disparoRealizado = true;
        jugador.cargando = false;
        jugador.potencia = CONFIG.POTENCIA_MINIMA;
        jugador.animacion = "disparo";
        jugador.tiempoAnimacion = 0.35;
        jugador.estadisticas.disparos += 1;
        this.disparoEnVuelo = true;
        this.retardoFinTurno = 0;

        this.registrarEvento({ tipo: "disparo", jugadorId: jugador.id, x: salidaX, y: salidaY });
        return true;
    }
    /**
     * Avanza la simulación autoritativa un paso de tiempo.
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizar(delta) {
        this.actualizarEfectos(delta);

        if (this.estado !== "jugando") {
            return;
        }

        this.actualizarViento();

        if (!this.jugadorConTurno()) {
            // El jugador del turno murió o se desconectó: se pasa al siguiente.
            this.avanzarTurno();

            if (this.estado !== "jugando") {
                return;
            }
        }

        this.actualizarCronometro(delta);
        this.moverJugadores(delta);
        this.moverProyectiles(delta);
        this.comprobarFinPartida();
    }

    /**
     * Deriva aleatoria del viento, igual que en el original: en cada paso hay
     * una probabilidad pequeña de variar el viento y se limita a ±20.
     */
    actualizarViento() {
        if (Math.random() < CONFIG.PROBABILIDAD_VIENTO) {
            this.viento += (Math.random() - 0.5) * CONFIG.DERIVA_VIENTO;
            this.viento = Math.max(-CONFIG.VIENTO_MAXIMO, Math.min(CONFIG.VIENTO_MAXIMO, this.viento));
        }
    }

    /**
     * Descuenta el cronómetro del turno y decide cuándo se cierra.
     *
     * El cronómetro SOLO cierra el turno (nunca termina la partida). Además,
     * cuando el disparo ya se resolvió, el turno se cierra tras un pequeño
     * margen para que todos vean la explosión.
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizarCronometro(delta) {
        this.tiempoTurno -= delta;

        if (this.tiempoTurno <= 0) {
            this.tiempoTurno = 0;
            this.avanzarTurno();
            return;
        }

        if (this.disparoEnVuelo && this.proyectiles.length === 0) {
            if (this.retardoFinTurno <= 0) {
                this.retardoFinTurno = CONFIG.RETARDO_FIN_TURNO;
                return;
            }

            this.retardoFinTurno -= delta;

            if (this.retardoFinTurno <= 0) {
                this.retardoFinTurno = 0;
                this.avanzarTurno();
            }
        }
    }

    /**
     * Mueve, carga el cañón y actualiza la animación de cada jugador.
     *
     * Solo el jugador con el turno puede desplazarse: el resto permanece
     * quieto, exactamente como en el original.
     *
     * @param {number} delta Segundos transcurridos.
     */
    moverJugadores(delta) {
        const conTurno = this.jugadorConTurno();

        this.listaJugadores().forEach((jugador) => {
            if (!jugador.vivo) {
                return;
            }

            const esSuTurno = Boolean(conTurno) && conTurno.id === jugador.id;

            if (esSuTurno && jugador.cargando) {
                jugador.potencia = Math.min(
                    CONFIG.POTENCIA_MAXIMA,
                    jugador.potencia + CONFIG.VELOCIDAD_CARGA * delta
                );
            }

            const movimiento = esSuTurno && !jugador.disparoRealizado ? jugador.movimiento : 0;
            jugador.vx = movimiento * CONFIG.VELOCIDAD_CAMINAR;

            this.moverHorizontal(jugador, delta);
            this.aplicarGravedad(jugador, delta);
            this.actualizarAnimacion(jugador, delta, movimiento);

            // Mecánica original: caer al agua mata.
            if (jugador.y - CONFIG.RADIO_PERSONAJE > CONFIG.NIVEL_AGUA) {
                this.matar(jugador, null, "agua");
            }
        });
    }

    /**
     * Desplaza al jugador en horizontal píxel a píxel.
     *
     * El paso fino permite tres comportamientos correctos:
     *  1. El jugador se detiene justo contra un muro (no lo atraviesa).
     *  2. Puede subir escalones de hasta ALTURA_ESCALON píxeles (plataformas
     *     de 25 px del mapa original), conservando la sensación original.
     *  3. No se cuela por huecos abiertos por explosiones cercanas.
     *
     * @param {object} jugador Estado del jugador.
     * @param {number} delta Segundos transcurridos.
     */
    moverHorizontal(jugador, delta) {
        const radio = CONFIG.RADIO_PERSONAJE;
        const recorridoTotal = Math.abs(jugador.vx * delta);
        const sentido = Math.sign(jugador.vx);

        if (sentido === 0 || recorridoTotal === 0) {
            return;
        }

        let recorrido = 0;

        while (recorrido < recorridoTotal) {
            const avance = Math.min(1, recorridoTotal - recorrido);
            const destino = jugador.x + sentido * avance;

            if (destino < radio || destino > CONFIG.ANCHO - radio) {
                return;
            }

            if (!this.terreno.colisionaCuerpo(destino, jugador.y)) {
                jugador.x = destino;
                recorrido += avance;
                continue;
            }

            const pies = jugador.y + radio;
            const cima = this.terreno.cimaColumna(destino, pies - CONFIG.ALTURA_ESCALON, CONFIG.ALTURA_ESCALON + 2);
            const esEscalon = cima !== null && pies - cima <= CONFIG.ALTURA_ESCALON && pies - cima >= -2;

            if (esEscalon && !this.terreno.colisionaCuerpo(destino, cima - radio)) {
                jugador.x = destino;
                jugador.y = cima - radio;
                jugador.vy = 0;
                jugador.enSuelo = true;
                // Toca suelo (escalón): recupera el doble salto.
                jugador.saltosRealizados = 0;
                recorrido += avance;
                continue;
            }

            return;
        }
    }
    /**
     * Aplica la gravedad y resuelve el apoyo sobre el terreno.
     *
     * Se usa la columna central del personaje, igual que el original usaba la
     * posición X para decidir sobre qué plataforma se apoyaba.
     *
     * @param {object} jugador Estado del jugador.
     * @param {number} delta Segundos transcurridos.
     */
    aplicarGravedad(jugador, delta) {
        const radio = CONFIG.RADIO_PERSONAJE;

        jugador.vy += CONFIG.GRAVEDAD * delta;

        const piesAntes = jugador.y + radio;
        jugador.y += jugador.vy * delta;
        const pies = jugador.y + radio;

        if (jugador.vy >= 0) {
            const margenAbajo = Math.max(4, pies - piesAntes + 2);
            const superficie = this.terreno.buscarSuperficie(jugador.x, pies, 2, margenAbajo);

            if (superficie !== null) {
                jugador.y = superficie - radio;
                jugador.vy = 0;
                jugador.enSuelo = true;
                // Aterrizó en una superficie válida (terreno, plataforma o
                // bloque, a cualquier altura): recupera el doble salto.
                jugador.saltosRealizados = 0;
                return;
            }
        }

        jugador.enSuelo = false;
    }

    /**
     * Actualiza el estado de animación que verá el cliente.
     *
     * Las animaciones puntuales (disparo, daño) tienen prioridad durante su
     * duración; después se vuelve al estado real del personaje (idle, caminar
     * o salto).
     *
     * @param {object} jugador Estado del jugador.
     * @param {number} delta Segundos transcurridos.
     * @param {number} movimiento -1, 0 o 1.
     */
    actualizarAnimacion(jugador, delta, movimiento) {
        if (jugador.tiempoAnimacion > 0) {
            jugador.tiempoAnimacion -= delta;

            if (jugador.tiempoAnimacion > 0) {
                return;
            }

            jugador.tiempoAnimacion = 0;
        }

        if (!jugador.enSuelo) {
            jugador.animacion = "salto";
            return;
        }

        jugador.animacion = movimiento !== 0 ? "caminar" : "idle";
    }

    /**
     * Mueve los proyectiles y resuelve impactos.
     *
     * Física idéntica al Proyectil original: el viento empuja en horizontal
     * (viento * factor) y la gravedad del proyectil tira hacia abajo. El
     * movimiento se subdivide para que un proyectil rápido no atraviese ni a
     * un personaje ni una capa fina de terreno.
     *
     * @param {number} delta Segundos transcurridos.
     */
    moverProyectiles(delta) {
        const radioProyectil = CONFIG.RADIO_PROYECTIL;
        const radioPersonaje = CONFIG.RADIO_PERSONAJE;

        this.proyectiles = this.proyectiles.filter((proyectil) => {
            proyectil.vx += this.viento * delta * CONFIG.VIENTO_FACTOR;
            proyectil.vy += CONFIG.GRAVEDAD_PROYECTIL * delta;

            const subdivisiones = 4;
            const avanceX = proyectil.vx * delta;
            const avanceY = proyectil.vy * delta;

            for (let paso = 1; paso <= subdivisiones; paso++) {
                const proporcion = paso / subdivisiones;
                const x = proyectil.x + avanceX * proporcion;
                const y = proyectil.y + avanceY * proporcion;

                const alcanzado = this.vivos().find((jugador) => {
                    return Math.hypot(jugador.x - x, jugador.y - y) < radioProyectil + radioPersonaje;
                });

                if (alcanzado) {
                    proyectil.x = x;
                    proyectil.y = y;
                    this.registrarEvento({ tipo: "impacto", jugadorId: alcanzado.id, x, y });
                    this.aplicarExplosion(x, y, CONFIG.RADIO_EXPLOSION_PERSONAJE, "#ff6b6b", proyectil.duenoId);
                    return false;
                }

                if (this.terreno.esSolidoEn(x, y)) {
                    proyectil.x = x;
                    proyectil.y = y;
                    this.aplicarExplosion(x, y, CONFIG.RADIO_EXPLOSION_TERRENO, "#ffb347", proyectil.duenoId);
                    return false;
                }
            }

            proyectil.x += avanceX;
            proyectil.y += avanceY;

            // Fuera del mapa: el original desactivaba el proyectil sin explotar.
            const fueraDelMapa = proyectil.x < -60 ||
                proyectil.x > CONFIG.ANCHO + 60 ||
                proyectil.y > CONFIG.ALTO + 60;

            return !fueraDelMapa;
        });
    }

    /**
     * Aplica una explosión: efecto visual, cráter y daño por distancia.
     *
     * Daño EXACTO al original: 100 * (1 - distancia / radio) para todo
     * personaje vivo dentro del radio (incluido el propio autor, como antes).
     *
     * @param {number} x Centro de la explosión.
     * @param {number} y Centro de la explosión.
     * @param {number} radio Radio de daño.
     * @param {string} color Color del efecto.
     * @param {string|null} autorId Id del jugador que disparó.
     */
    aplicarExplosion(x, y, radio, color, autorId) {
        this.explosiones.push({
            x,
            y,
            radio,
            color,
            vida: CONFIG.DURACION_EXPLOSION,
            maxima: CONFIG.DURACION_EXPLOSION
        });

        const radioCrater = radio * CONFIG.RADIO_CRATER;

        if (this.terreno.excavar(x, y, radioCrater)) {
            const crater = { x: Math.round(x), y: Math.round(y), r: Math.round(radioCrater) };
            this.crateres.push(crater);
            this.crateresNuevos.push(crater);
        }

        this.registrarEvento({ tipo: "explosion", x, y, radio, color });

        this.vivos().forEach((jugador) => {
            const distancia = Math.hypot(jugador.x - x, jugador.y - y);

            if (distancia < radio) {
                const danio = CONFIG.DANIO_MAXIMO * (1 - distancia / radio);
                this.recibirDanio(jugador, danio, autorId, "explosion");
            }
        });
    }
    /**
     * Aplica daño autoritativo a un jugador y resuelve su muerte.
     *
     * @param {object} jugador Estado del jugador.
     * @param {number} cantidad Daño solicitado por la simulación.
     * @param {string|null} autorId Id del jugador responsable.
     * @param {string} causa Motivo del daño ("explosion" o "agua").
     */
    recibirDanio(jugador, cantidad, autorId, causa) {
        if (!jugador || !jugador.vivo) {
            return;
        }

        const vidaAntes = jugador.vida;
        const danio = Math.max(0, Math.round(cantidad));

        if (danio <= 0) {
            return;
        }

        jugador.vida = Math.max(0, jugador.vida - danio);

        const autor = autorId ? this.jugadores.get(autorId) : null;

        if (autor && autor.id !== jugador.id) {
            autor.estadisticas.danioInfligido += Math.min(danio, vidaAntes);
        }

        jugador.animacion = "danio";
        jugador.tiempoAnimacion = 0.45;

        this.registrarEvento({
            tipo: "danio",
            jugadorId: jugador.id,
            vida: jugador.vida,
            cantidad: Math.min(danio, vidaAntes)
        });

        if (jugador.vida <= 0) {
            this.matar(jugador, autor, causa);
        }
    }

    /**
     * Elimina a un jugador del campo de batalla.
     *
     * @param {object} jugador Estado del jugador.
     * @param {object|null} autor Jugador responsable (puede ser null).
     * @param {string} causa Motivo de la muerte.
     */
    matar(jugador, autor, causa) {
        if (!jugador.vivo) {
            return;
        }

        jugador.vivo = false;
        jugador.vida = 0;
        jugador.vx = 0;
        jugador.vy = 0;
        jugador.movimiento = 0;
        jugador.cargando = false;
        jugador.potencia = CONFIG.POTENCIA_MINIMA;
        jugador.animacion = "muerto";
        jugador.tiempoAnimacion = 0;
        jugador.estadisticas.muertes += 1;

        if (autor && autor.id !== jugador.id) {
            autor.estadisticas.bajas += 1;
        }

        this.registrarEvento({
            tipo: "muerte",
            jugadorId: jugador.id,
            nombre: jugador.nombre,
            x: jugador.x,
            y: jugador.y,
            causa: causa || "explosion"
        });
    }

    /**
     * ÚNICA función autorizada a terminar la partida.
     *
     * La partida termina cuando queda un único superviviente (gana) o cuando
     * no queda ninguno (empate). También termina si la sala se queda sin
     * jugadores conectados.
     *
     * @returns {boolean} true si la partida quedó finalizada.
     */
    comprobarFinPartida() {
        if (this.estado === "finalizado") {
            return true;
        }

        const conectados = this.listaJugadores().filter((jugador) => jugador.conectado);
        const vivos = this.vivos();

        if (!conectados.length) {
            this.finalizar(null, "sala-vacia");
            return true;
        }

        if (vivos.length <= 1) {
            this.finalizar(vivos[0] || null, vivos.length === 1 ? "superviviente" : "empate");
            return true;
        }

        return false;
    }

    /**
     * Congela la partida y fija el ganador.
     *
     * @param {object|null} ganador Jugador ganador (null si no hubo).
     * @param {string} motivo Motivo del final.
     */
    finalizar(ganador, motivo) {
        if (this.estado === "finalizado") {
            return;
        }

        this.estado = "finalizado";
        this.motivoFinal = motivo;
        this.turno = null;
        this.tiempoTurno = 0;
        this.retardoFinTurno = 0;
        this.proyectiles = [];
        this.disparoEnVuelo = false;

        this.listaJugadores().forEach((jugador) => {
            jugador.vx = 0;
            jugador.vy = 0;
            jugador.movimiento = 0;
            jugador.cargando = false;
        });

        this.ganador = ganador
            ? { id: ganador.id, nombre: ganador.nombre, personaje: ganador.personaje }
            : null;

        this.registrarEvento({
            tipo: "fin-partida",
            ganadorId: this.ganador ? this.ganador.id : null,
            ganadorNombre: this.ganador ? this.ganador.nombre : null,
            motivo
        });
    }

    /**
     * Actualiza los efectos visuales que el cliente dibuja (explosiones).
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizarEfectos(delta) {
        this.explosiones = this.explosiones.filter((explosion) => {
            explosion.vida -= delta;
            return explosion.vida > 0;
        });
    }

    /**
     * Saca a un jugador de la partida en curso por desconexión.
     *
     * No se sustituye por ninguna IA: su personaje queda fuera del campo, se
     * avisa a los demás y la partida continúa con los jugadores restantes.
     *
     * @param {string} idJugador Id del socket que se desconectó.
     */
    quitarJugador(idJugador) {
        const jugador = this.jugadores.get(idJugador);

        if (!jugador) {
            return;
        }

        jugador.conectado = false;
        const estabaJugando = jugador.vivo;

        if (jugador.vivo) {
            this.matar(jugador, null, "desconexion");
        }

        this.registrarEvento({
            tipo: "abandono",
            jugadorId: idJugador,
            nombre: jugador.nombre,
            estabaVivo: estabaJugando
        });

        // El orden de turnos se conserva: avanzarTurno() salta a los
        // jugadores desconectados igual que salta a los eliminados.
        if (this.turno === idJugador) {
            this.turno = null;
            this.avanzarTurno();
        }

        this.comprobarFinPartida();
    }
    /**
     * Redondea las coordenadas que se envían al cliente.
     *
     * Enviar decimales de más llenaría la red sin aportar nada: el cliente
     * interpola entre paquetes de todos modos.
     *
     * @param {number} valor Número a redondear.
     * @returns {number}
     */
    redondear(valor) {
        return Math.round(valor * 10) / 10;
    }

    /**
     * Convierte el estado interno de un jugador en datos enviables.
     *
     * @param {object} jugador Estado del jugador.
     * @returns {object}
     */
    serializarJugador(jugador) {
        return {
            id: jugador.id,
            nombre: jugador.nombre,
            personaje: jugador.personaje,
            indice: jugador.indice,
            x: this.redondear(jugador.x),
            y: this.redondear(jugador.y),
            vida: Math.round(jugador.vida),
            vivo: jugador.vivo,
            conectado: jugador.conectado,
            direccion: jugador.direccion,
            enSuelo: jugador.enSuelo,
            angulo: Math.round(jugador.angulo),
            potencia: Math.round(jugador.potencia),
            cargando: jugador.cargando,
            disparoRealizado: jugador.disparoRealizado,
            animacion: jugador.animacion,
            estadisticas: { ...jugador.estadisticas }
        };
    }

    /**
     * Construye el paquete de estado que se envía a todos los clientes.
     *
     * Los cráteres y los eventos se envían como DELTA: solo lo ocurrido desde
     * el paquete anterior, y se vacían al construirlo.
     *
     * @returns {object}
     */
    instantanea() {
        const crateres = this.crateresNuevos;
        const eventos = this.eventos;

        this.crateresNuevos = [];
        this.eventos = [];

        return {
            tipo: "estado",
            numero: this.numero,
            estado: this.estado,
            turno: this.turno,
            tiempo: Math.max(0, Math.ceil(this.tiempoTurno)),
            // Duración total del turno: el HUD la usa para pintar el reloj
            // (anillo de progreso) sin tener una copia propia del número.
            duracionTurno: CONFIG.DURACION_TURNO,
            numeroTurno: this.numeroTurno,
            viento: this.redondear(this.viento),
            jugadores: this.listaJugadores().map((jugador) => this.serializarJugador(jugador)),
            proyectiles: this.proyectiles.map((proyectil) => ({
                id: proyectil.id,
                duenoId: proyectil.duenoId,
                x: this.redondear(proyectil.x),
                y: this.redondear(proyectil.y)
            })),
            crateres,
            ganador: this.ganador,
            motivoFinal: this.motivoFinal,
            eventos
        };
    }

    /**
     * Paquete inicial completo: incluye el mundo y TODOS los cráteres.
     *
     * Se envía al empezar la partida, al reiniciarla y cuando alguien entra
     * a una partida ya comenzada, para que reconstruya el terreno exacto.
     *
     * @returns {object}
     */
    instantaneaInicial() {
        const estado = this.instantanea();

        return {
            ...estado,
            tipo: "inicio",
            // El mundo incluye el escenario para que el cliente elija su música.
            mundo: { ...this.terreno.serializar(), escenario: CONFIG.ESCENARIO },
            crateres: this.crateres.slice()
        };
    }
}

module.exports = Partida;








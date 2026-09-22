/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Cliente de juego
 * =========================================================
 *
 * Bucle de dibujo, controles y tratamiento de los estados del servidor.
 *
 * REGLA DE ORO: este archivo NUNCA decide la partida. No calcula daño, ni
 * vida, ni muertes, ni el ganador, ni siquiera la posición final: envía
 * INTENCIONES al servidor y dibuja lo que el servidor confirma (con un
 * suavizado visual para que el movimiento se vea fluido entre paquetes).
 *
 * El jugador solo puede controlar SU personaje: el servidor rechaza
 * cualquier acción de un jugador que no tenga el turno.
 */

const PASO_MAXIMO_DELTA = 1 / 30;

class Juego {
    /**
     * @param {HTMLCanvasElement} canvas Lienzo del juego.
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.ancho = CONFIG_CLIENTE.ANCHO_POR_DEFECTO;
        this.alto = CONFIG_CLIENTE.ALTO_POR_DEFECTO;
        this.canvas.width = this.ancho;
        this.canvas.height = this.alto;

        this.estado = null;
        this.terreno = null;
        this.escenario = new Escenario(this.ancho, this.alto);
        this.particulas = new Particulas(this.ctx);
        this.explosiones = [];
        this.proyectiles = new Map(); // id -> { x, y, destinoX, destinoY, rastro }
        this.jugadores = new Map(); // id -> PersonajeVista
        this.textos = []; // Números de daño flotantes.
        this.interfaz = new Interfaz(this);

        this.activo = false;
        this.ultimoTiempo = 0;
        this.ultimoEnvio = 0;
        this.temblor = 0;
        this.viento = 0;
        this.tiempoRestante = 0;
        this.tiempoServidor = 0;
        this.tiempoRecibido = 0;

        /**
         * Duración total del turno, tal y como la manda el servidor en cada
         * paquete de estado ("duracionTurno"). La usa el HUD para el anillo de
         * progreso del reloj: aquí NO hay ninguna copia del número, así que
         * cambiar la duración en servidor/config.js cambia el reloj de todos.
         */
        this.duracionTurno = 0;

        this.anguloLocal = 30;
        this.potenciaLocal = CONFIG_CLIENTE.POTENCIA_MINIMA;
        this.cargando = false;
        this.avisoCentral = { texto: "", subtexto: "", color: "#ffd166", tiempo: 0, duracion: 1.6 };
        this.finalizado = false;
        this.alTerminar = null;
        this.claves = new Set();

        /**
         * Doble salto (ESPACIO): pulsación pendiente de enviar y marca de si el
         * último paquete ya mandó una pulsación.
         *
         * Se apunta la PULSACIÓN (no el mantener la tecla) y se garantiza que
         * nunca salen dos "pulsado" seguidos sin un "suelto" en medio: así el
         * servidor recibe siempre un borde limpio y ninguna pulsación se pierde,
         * aunque sea muy corta o caiga entre dos paquetes. Quién decide si toca
         * primer salto, segundo salto o ninguno es el servidor.
         */
        this.saltoPulsado = false;
        this.saltoEnviado = false;

        this.configurarControles();
    }

    /* --- Consultas del jugador local ------------------------------------- */

    /** Estado (vista) del jugador local. */
    miJugador() {
        return this.jugadores.get(window.redJuego.id) || null;
    }

    /** Datos autoritativos del jugador local. */
    miJugadorEstado() {
        if (!this.estado || !Array.isArray(this.estado.jugadores)) {
            return null;
        }

        return this.estado.jugadores.find((jugador) => jugador.id === window.redJuego.id) || null;
    }

    /** Indica si el turno es del jugador local. */
    esMiTurno() {
        return Boolean(this.estado) && this.estado.turno === window.redJuego.id;
    }

    /** Indica si el jugador local puede actuar (turno, vivo y sin disparar). */
    puedeActuar() {
        const mio = this.miJugadorEstado();
        return this.esMiTurno() && Boolean(mio) && mio.vivo && !mio.disparoRealizado;
    }

    /* --- Controles -------------------------------------------------------- */

    /**
     * Registra los controles del juego (mismos que el original):
     * A / ← izquierda, D / → derecha, W / ↑ apuntar arriba,
     * S / ↓ apuntar abajo, ESPACIO saltar (dos veces: doble salto),
     * CLIC cargar y disparar.
     */
    configurarControles() {
        const bloquear = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];

        window.addEventListener("keydown", (evento) => {
            if (bloquear.includes(evento.code)) {
                evento.preventDefault();
            }

            // Doble salto: cada PULSACIÓN de ESPACIO se apunta una sola vez (la
            // repetición automática del teclado no cuenta como pulsación nueva).
            if (evento.code === "Space" && !evento.repeat) {
                this.saltoPulsado = true;
            }

            this.claves.add(evento.code);
        });

        window.addEventListener("keyup", (evento) => {
            this.claves.delete(evento.code);
        });

        // Si la ventana pierde el foco no debe quedarse ninguna tecla pulsada
        // (ni una pulsación de salto pendiente).
        window.addEventListener("blur", () => {
            this.claves.clear();
            this.saltoPulsado = false;
            this.saltoEnviado = false;
            this.soltarCarga();
        });

        this.canvas.addEventListener("mousedown", (evento) => {
            if (evento.button === 0) {
                this.intentarCargar();
            }
        });

        // El clic se suelta sobre la ventana para no perder el disparo si el
        // cursor sale del lienzo.
        window.addEventListener("mouseup", (evento) => {
            if (evento.button === 0) {
                this.soltarCarga();
            }
        });

        this.canvas.addEventListener("contextmenu", (evento) => evento.preventDefault());
    }

    /** Teclas derivadas del estado actual del teclado. */
    leerTeclas() {
        return {
            izquierda: this.claves.has("KeyA") || this.claves.has("ArrowLeft"),
            derecha: this.claves.has("KeyD") || this.claves.has("ArrowRight"),
            arriba: this.claves.has("KeyW") || this.claves.has("ArrowUp"),
            abajo: this.claves.has("KeyS") || this.claves.has("ArrowDown"),
            salto: this.claves.has("Space")
        };
    }

    /** Comienza a cargar el cañón (clic presionado). */
    intentarCargar() {
        if (!this.puedeActuar()) {
            if (!this.esMiTurno() && this.estado && this.estado.estado === "jugando") {
                this.mostrarAviso("MIRA LA PARTIDA", "Todavía no es tu turno", "#62e6ff", 1);
            }

            return;
        }

        this.cargando = true;
        this.potenciaLocal = CONFIG_CLIENTE.POTENCIA_MINIMA;
        window.redJuego.cargar(true);
    }

    /** Suelta la carga y dispara (clic soltado). */
    soltarCarga() {
        if (!this.cargando) {
            return;
        }

        const puedeDisparar = this.puedeActuar();
        this.cargando = false;
        window.redJuego.cargar(false);

        if (puedeDisparar) {
            window.redJuego.disparar();
        }
    }

    /* --- Ciclo de vida ---------------------------------------------------- */

    /** Arranca el bucle de dibujo. */
    iniciar() {
        if (this.activo) {
            return;
        }

        this.activo = true;
        this.ultimoTiempo = performance.now();
        requestAnimationFrame((tiempo) => this.bucle(tiempo));
    }

    /** Detiene el bucle de dibujo. */
    detener() {
        this.activo = false;
        this.claves.clear();
        this.cargando = false;
        window.sonidoJuego.detenerEfectos();
    }

    /**
     * Bucle principal: actualiza y dibuja.
     *
     * @param {number} tiempo Marca de tiempo del navegador.
     */
    bucle(tiempo) {
        if (!this.activo) {
            return;
        }

        const delta = Math.max(0, Math.min((tiempo - this.ultimoTiempo) / 1000, PASO_MAXIMO_DELTA));
        this.ultimoTiempo = tiempo;

        this.actualizar(delta, tiempo);
        this.dibujar();

        requestAnimationFrame((siguiente) => this.bucle(siguiente));
    }

    /**
     * Muestra un aviso grande y temporal en el centro de la pantalla.
     *
     * @param {string} texto Texto principal.
     * @param {string} subtexto Texto secundario.
     * @param {string} color Color del texto principal.
     * @param {number} duracion Duración en segundos.
     */
    mostrarAviso(texto, subtexto = "", color = "#ffd166", duracion = 1.6) {
        this.avisoCentral = { texto, subtexto, color, tiempo: duracion, duracion };
    }

    /**
     * Añade un texto flotante (por ejemplo "-45" al recibir daño).
     *
     * @param {number} x Posición horizontal.
     * @param {number} y Posición vertical.
     * @param {string} texto Texto a mostrar.
     * @param {string} color Color del texto.
     */
    agregarTexto(x, y, texto, color = "#ffd166") {
        this.textos.push({ x, y, texto, color, tiempo: 1, duracion: 1 });

        if (this.textos.length > 40) {
            this.textos.shift();
        }
    }

    /* --- Estados que llegan del servidor ---------------------------------- */

    /**
     * Procesa un paquete de estado del servidor.
     *
     * Es la ÚNICA entrada de datos de juego del cliente.
     *
     * @param {object} paquete Paquete "inicio" o "estado".
     */
    alRecibir(paquete) {
        if (!paquete || !Array.isArray(paquete.jugadores)) {
            return;
        }

        if (paquete.tipo === "inicio") {
            this.prepararMundo(paquete);
        } else if (Array.isArray(paquete.crateres) && this.terreno) {
            paquete.crateres.forEach((crater) => this.terreno.aplicarCrater(crater.x, crater.y, crater.r));
        }

        this.estado = paquete;
        this.viento = paquete.viento;
        this.tiempoServidor = paquete.tiempo;
        this.tiempoRecibido = performance.now();
        this.tiempoRestante = paquete.tiempo;

        // Duración del turno decidida por el servidor (reloj del HUD).
        if (paquete.duracionTurno > 0) {
            this.duracionTurno = paquete.duracionTurno;
        }

        this.actualizarJugadores(paquete.jugadores);
        this.actualizarProyectiles(paquete.proyectiles || []);
        this.procesarEventos(paquete.eventos || []);

        if (paquete.estado === "finalizado" && !this.finalizado) {
            this.finalizado = true;
            this.cargando = false;

            if (typeof this.alTerminar === "function") {
                this.alTerminar(paquete);
            }
        }
    }

    /**
     * Prepara el mundo al empezar (o reiniciar) una partida.
     *
     * @param {object} paquete Paquete inicial completo.
     */
    prepararMundo(paquete) {
        this.ancho = paquete.mundo.ancho;
        this.alto = paquete.mundo.alto;
        this.canvas.width = this.ancho;
        this.canvas.height = this.alto;
        this.terreno = new Terreno(paquete.mundo);
        this.escenario = new Escenario(this.ancho, this.alto);
        this.particulas.limpiar();
        this.explosiones = [];
        this.proyectiles.clear();
        this.textos = [];
        this.jugadores.clear();
        this.claves.clear();
        this.cargando = false;
        this.finalizado = false;

        (paquete.crateres || []).forEach((crater) => this.terreno.aplicarCrater(crater.x, crater.y, crater.r));

        this.mostrarAviso(
            paquete.numero > 1 ? "¡REVANCHA!" : "¡A LA BATALLA!",
            `${paquete.jugadores.length} pollitos en el campo`,
            "#a8ff72",
            2.2
        );

        // Música de la partida: usa la del escenario si existe y, si no, la de
        // batalla. El escenario lo decide el servidor (paquete.mundo.escenario).
        window.sonidoJuego.reproducirMusicaDePartida(paquete.mundo.escenario);
    }

    /**
     * Crea o actualiza las vistas de los jugadores.
     *
     * @param {Array} lista Jugadores enviados por el servidor.
     */
    actualizarJugadores(lista) {
        lista.forEach((datos) => {
            let vista = this.jugadores.get(datos.id);

            if (!vista) {
                vista = new PersonajeVista(datos, this.paletaDe(datos.personaje));
                vista.esLocal = datos.id === window.redJuego.id;
                this.jugadores.set(datos.id, vista);
            }

            vista.fijarEstado(datos);
        });

        // Jugadores que ya no están (desconexiones) dejan de dibujarse.
        [...this.jugadores.keys()].forEach((id) => {
            if (!lista.some((jugador) => jugador.id === id)) {
                this.jugadores.delete(id);
            }
        });
    }

    /**
     * Devuelve la paleta de un personaje.
     *
     * @param {number} indice Índice del personaje.
     * @returns {object}
     */
    paletaDe(indice) {
        const paletas = window.paletasPersonajes || [];
        const respaldo = { cuerpo: "#ffffff", cresta: "#ff5c5c", pico: "#ffb347" };
        return paletas[indice] || respaldo;
    }

    /**
     * Suaviza la posición de los proyectiles entre paquetes.
     *
     * @param {Array} lista Proyectiles enviados por el servidor.
     */
    actualizarProyectiles(lista) {
        const ids = new Set(lista.map((proyectil) => proyectil.id));

        [...this.proyectiles.keys()].forEach((id) => {
            if (!ids.has(id)) {
                // El proyectil explotó: se añade su rastro al humo.
                const anterior = this.proyectiles.get(id);

                if (anterior) {
                    this.particulas.crear(anterior.x, anterior.y, "rgba(120, 100, 70, 0.7)", 4, 40, { vida: 0.6, radio: 4 });
                }

                this.proyectiles.delete(id);
            }
        });

        lista.forEach((datos) => {
            let proyectil = this.proyectiles.get(datos.id);

            if (!proyectil) {
                proyectil = { x: datos.x, y: datos.y, destinoX: datos.x, destinoY: datos.y, rastro: [] };
                this.proyectiles.set(datos.id, proyectil);
            }

            proyectil.destinoX = datos.x;
            proyectil.destinoY = datos.y;
        });
    }

    /* --- Eventos del juego (efectos y sonidos) ---------------------------- */

    /**
     * Convierte los eventos del servidor en efectos visuales y sonidos.
     *
     * Los eventos son la única fuente de verdad para el feedback: el cliente
     * no inventa explosiones ni muertes.
     *
     * @param {Array} eventos Lista de eventos.
     */
    procesarEventos(eventos) {
        eventos.forEach((evento) => {
            const vista = evento.jugadorId ? this.jugadores.get(evento.jugadorId) : null;
            const mio = evento.jugadorId === window.redJuego.id;

            switch (evento.tipo) {
                case "inicio-partida":
                    // Pendiente de archivo (efectos/partida/inicio_de_partida).
                    window.sonidoJuego.reproducirEfecto("inicioPartida");
                    break;

                case "turno":
                    // Cambio de jugador: el servidor envía un solo evento por
                    // turno y el módulo de sonido evita repeticiones, así que
                    // suena exactamente una vez al empezar el turno nuevo.
                    window.sonidoJuego.reproducirCambioDeJugador();

                    if (mio) {
                        this.mostrarAviso("🐔 TU TURNO", "¡Apúntate y dispara!", "#ffd166", 1.8);
                        this.cargando = false;
                        this.potenciaLocal = CONFIG_CLIENTE.POTENCIA_MINIMA;
                    }
                    break;

                case "disparo":
                    // Un disparo, un sonido (nunca se repite por mantener pulsado).
                    window.sonidoJuego.reproducirDisparo();
                    this.particulas.chispasDisparo(evento.x, evento.y);

                    if (vista) {
                        vista.marcarDisparo();
                    }

                    if (mio) {
                        this.cargando = false;
                    }
                    break;

                case "salto":
                    window.sonidoJuego.reproducirEfecto("salto");
                    break;

                case "impacto":
                    window.sonidoJuego.reproducirEfecto("impacto");
                    this.particulas.crear(evento.x, evento.y, "#ffd166", 10, 180, { vida: 0.4, radio: 4 });
                    break;

                case "explosion":
                    this.explosiones.push(new Explosion(evento.x, evento.y, evento.radio, evento.color, 0.7));
                    this.particulas.humoExplosion(evento.x, evento.y);
                    // Una explosión, un sonido (pueden sonar varias a la vez).
                    window.sonidoJuego.reproducirExplosion();
                    this.temblor = Math.min(14, this.temblor + 6);
                    break;

                case "danio":
                    window.sonidoJuego.reproducirEfecto("danio");

                    if (vista) {
                        vista.marcarDanio();
                        this.agregarTexto(vista.x, vista.y - 56, `-${evento.cantidad}`, mio ? "#ff8a8a" : "#ffffff");
                    }
                    break;

                case "muerte":
                    window.sonidoJuego.reproducirEfecto("muerte");

                    if (vista) {
                        this.particulas.plumasMuerte(evento.x, evento.y, vista.paleta.cuerpo);
                    }

                    this.agregarTexto(evento.x, evento.y - 64, `☠ ${evento.nombre}`, "#ff9b9b");

                    if (mio) {
                        this.mostrarAviso("💀 HAS SIDO ELIMINADO", "Puedes seguir mirando la partida", "#ff8a8a", 2.4);
                    }
                    break;

                case "abandono":
                    this.agregarTexto(evento.x || this.ancho / 2, evento.y || 120, `${evento.nombre} abandonó`, "#ffb347");
                    break;

                case "fin-partida":
                    // Fin de la partida: se corta la música de batalla y suena
                    // game over, tanto si el jugador local gana como si pierde.
                    window.sonidoJuego.detenerMusica();
                    window.sonidoJuego.reproducirGameOver();
                    break;

                default:
                    break;
            }
        });
    }

    /* --- Actualización por fotograma -------------------------------------- */

    /**
     * Actualiza el mundo visual y envía la entrada del jugador.
     *
     * @param {number} delta Segundos transcurridos.
     * @param {number} tiempo Marca de tiempo actual.
     */
    actualizar(delta, tiempo) {
        this.escenario.actualizar(delta);
        this.particulas.actualizar(delta);

        this.explosiones = this.explosiones.filter((explosion) => {
            explosion.actualizar(delta);
            return explosion.activa;
        });

        this.temblor = Math.max(0, this.temblor - delta * 30);

        this.textos = this.textos.filter((texto) => {
            texto.y -= delta * 26;
            texto.tiempo -= delta;
            return texto.tiempo > 0;
        });

        if (this.avisoCentral.tiempo > 0) {
            this.avisoCentral.tiempo -= delta;
        }

        // Cronómetro local: parte del último valor del servidor y avanza solo
        // entre paquetes (el servidor sigue siendo la autoridad).
        if (this.estado && this.estado.estado === "jugando") {
            const transcurrido = (performance.now() - this.tiempoRecibido) / 1000;
            this.tiempoRestante = Math.max(0, this.tiempoServidor - transcurrido);
        }

        this.jugadores.forEach((jugador) => jugador.actualizar(delta));

        this.proyectiles.forEach((proyectil) => {
            const factor = Math.min(1, delta * 20);
            proyectil.x += (proyectil.destinoX - proyectil.x) * factor;
            proyectil.y += (proyectil.destinoY - proyectil.y) * factor;

            proyectil.rastro.push({ x: proyectil.x, y: proyectil.y });

            if (proyectil.rastro.length > 12) {
                proyectil.rastro.shift();
            }
        });

        this.actualizarObjetivoLocal();
        this.sincronizarAngulo();
        this.enviarEntrada(tiempo);
    }

    /**
     * Mantiene la potencia mostrada coherente con el servidor.
     *
     * Si el jugador está cargando, la potencia avanza localmente al mismo
     * ritmo que el servidor (280 por segundo) para que la barra no dé saltos;
     * si no está cargando, se copia el valor autoritativo.
     */
    actualizarObjetivoLocal() {
        const mio = this.miJugadorEstado();

        if (!mio) {
            return;
        }

        if (this.cargando && this.puedeActuar()) {
            this.potenciaLocal = Math.min(
                CONFIG_CLIENTE.POTENCIA_MAXIMA,
                this.potenciaLocal + 280 * PASO_MAXIMO_DELTA
            );
        } else {
            this.potenciaLocal = mio.potencia;
        }

        if (!this.puedeActuar()) {
            this.cargando = false;
        }
    }

    /**
     * Sincroniza el ángulo local con el del servidor.
     *
     * Solo se corrige cuando la diferencia es grande (por ejemplo al empezar
     * el turno), para no pelear con el ajuste que hace el jugador con W y S.
     */
    sincronizarAngulo() {
        const mio = this.miJugadorEstado();

        if (!mio) {
            return;
        }

        const teclas = this.leerTeclas();
        const velocidad = 60 * PASO_MAXIMO_DELTA; // 60° por segundo, como el original

        if (this.puedeActuar()) {
            if (teclas.arriba) {
                this.anguloLocal = Math.min(80, this.anguloLocal + velocidad);
            }

            if (teclas.abajo) {
                this.anguloLocal = Math.max(-80, this.anguloLocal - velocidad);
            }
        }

        if (Math.abs(this.anguloLocal - mio.angulo) > 8) {
            this.anguloLocal = mio.angulo;
        }
    }

    /**
     * Envía la intención del jugador al servidor.
     *
     * Solo se envían entradas cuando el jugador puede actuar: el servidor
     * ignoraría cualquier otra cosa, así que no se malgasta red.
     *
     * @param {number} tiempo Marca de tiempo actual.
     */
    enviarEntrada(tiempo) {
        if (tiempo - this.ultimoEnvio < CONFIG_CLIENTE.FRECUENCIA_ENTRADA) {
            return;
        }

        this.ultimoEnvio = tiempo;

        if (!this.puedeActuar()) {
            // Fuera de su turno no se envía nada: la pulsación pendiente se
            // descarta para que el pollito no salte solo al empezar el turno.
            this.saltoPulsado = false;
            this.saltoEnviado = false;
            return;
        }

        const teclas = this.leerTeclas();
        const mio = this.miJugadorEstado();

        /**
         * ESPACIO viaja como PULSACIÓN, nunca como "mantener": el servidor
         * recibe un borde limpio por cada toque y decide si es el primer salto,
         * el segundo (doble salto) o ninguno. Si dos toques cayeran en el mismo
         * hueco entre paquetes, el segundo espera al siguiente paquete en lugar
         * de perderse, y nunca se mandan dos "pulsado" seguidos.
         */
        const saltar = this.saltoPulsado && !this.saltoEnviado;

        this.saltoEnviado = saltar;

        if (saltar) {
            this.saltoPulsado = false;
        }

        window.redJuego.entrada({
            direccion: teclas.izquierda && !teclas.derecha ? -1 : teclas.derecha && !teclas.izquierda ? 1 : 0,
            saltar,
            angulo: Math.round(this.anguloLocal)
        });

        // Sonido de pasos mientras se camina y el personaje está en el suelo.
        // (Pendiente de archivo: efectos/jugadores/pasos.)
        if (mio && mio.enSuelo && (teclas.izquierda !== teclas.derecha)) {
            window.sonidoJuego.reproducirEfecto("paso");
        }
    }

    /* --- Dibujo ------------------------------------------------------------ */

    /**
     * Dibuja el fotograma completo.
     */
    dibujar() {
        const ctx = this.ctx;

        ctx.save();
        ctx.clearRect(0, 0, this.ancho, this.alto);
        this.escenario.dibujarCielo(ctx);

        if (!this.terreno) {
            this.dibujarEspera(ctx);
            ctx.restore();
            return;
        }

        ctx.save();

        // Temblor de cámara al explotar.
        if (this.temblor > 0.2) {
            ctx.translate((Math.random() - 0.5) * this.temblor, (Math.random() - 0.5) * this.temblor);
        }

        this.terreno.dibujar(ctx);
        this.escenario.dibujarDecoracion(ctx, this.terreno.plataformas, this.terreno);
        this.escenario.dibujarMar(ctx);

        // Personajes ordenados por personaje para que el dibujo sea estable.
        const turno = this.estado ? this.estado.turno : null;

        [...this.jugadores.values()]
            .sort((a, b) => a.indicePersonaje - b.indicePersonaje)
            .forEach((jugador) => {
                jugador.dibujar(ctx, {
                    esTurno: jugador.id === turno,
                    mostrarNombres: OpcionesJuego.valores.mostrarNombres
                });
            });

        this.dibujarProyectiles(ctx);
        this.explosiones.forEach((explosion) => explosion.dibujar(ctx));
        this.particulas.dibujar();
        this.dibujarTextos(ctx);

        ctx.restore();

        this.interfaz.dibujar(ctx);
        ctx.restore();
    }

    /**
     * Mensaje mientras se espera el primer estado del servidor.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarEspera(ctx) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 26px 'Trebuchet MS', Verdana, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("🐔 Preparando el campo de batalla...", this.ancho / 2, this.alto / 2);
        ctx.restore();
    }

    /**
     * Dibuja los proyectiles con su estela.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarProyectiles(ctx) {
        this.proyectiles.forEach((proyectil) => {
            ctx.save();

            // Estela.
            proyectil.rastro.forEach((punto, indice) => {
                const proporcion = (indice + 1) / proyectil.rastro.length;
                ctx.globalAlpha = proporcion * 0.45;
                ctx.fillStyle = "#ffd166";
                ctx.beginPath();
                ctx.arc(punto.x, punto.y, 2 + proporcion * 4, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalAlpha = 1;

            // Bala.
            const halo = ctx.createRadialGradient(proyectil.x, proyectil.y, 1, proyectil.x, proyectil.y, 14);
            halo.addColorStop(0, "rgba(255, 246, 210, 0.95)");
            halo.addColorStop(1, "rgba(255, 170, 60, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(proyectil.x, proyectil.y, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#2b2b2b";
            ctx.beginPath();
            ctx.arc(proyectil.x, proyectil.y, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#f5e6a4";
            ctx.beginPath();
            ctx.arc(proyectil.x - 2, proyectil.y - 2, 2.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });
    }

    /**
     * Dibuja los textos flotantes (daño, avisos de eliminación).
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarTextos(ctx) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 16px 'Trebuchet MS', Verdana, sans-serif";

        this.textos.forEach((texto) => {
            ctx.globalAlpha = Math.max(0, Math.min(1, texto.tiempo));
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(4, 16, 28, 0.9)";
            ctx.strokeText(texto.texto, texto.x, texto.y);
            ctx.fillStyle = texto.color;
            ctx.fillText(texto.texto, texto.x, texto.y);
        });

        ctx.restore();
    }
}





window.Juego = Juego;


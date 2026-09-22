/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Chat flotante de combate
 * =========================================================
 *
 * Mensajes tipo cápsula que aparecen SOBRE el juego, en la parte superior
 * izquierda y justo debajo del HUD "TURNO DE", y se van solos:
 *
 *   [ROJO] Brandon1: ¡Toma esto!
 *   [AZUL] Brandon2: ¡Buen disparo!
 *
 *  - NO hay panel ni historial permanente: cada mensaje es una burbuja
 *    independiente que se apaga a los 4 s (opacidad + translateY) y como
 *    máximo se ven 5 a la vez (el más antiguo deja sitio al nuevo).
 *  - El campo de escritura solo existe mientras el jugador escribe: se abre
 *    con ENTER o T, se envía con ENTER y se oculta al enviar (ESCAPE cancela,
 *    y un clic fuera del campo también).
 *  - Viaja por la MISMA conexión Socket.IO de la partida (js/red.js): el
 *    servidor retransmite cada mensaje solo a la sala del jugador
 *    (servidor/servidor.js -> "chat:enviar" / "chat:mensaje").
 *  - No toca el juego: mientras se escribe, las teclas no llegan al juego
 *    (nada de mover al pollito ni disparar sin querer) y ese clic no dispara.
 *  - El texto se pinta con textContent: lo que escriba un jugador se ve
 *    literal, nunca se interpreta como HTML.
 *
 * Su aspecto está en css/estilos.css (sección 11).
 */

/** Cuánto tiempo (ms) se queda cada mensaje en pantalla (≈4 s). */
const CHAT_DURACION_MENSAJE = 4000;

/** Duración (ms) de la animación de salida (la misma que en el CSS). */
const CHAT_DURACION_SALIDA = 300;

/** Mensajes visibles a la vez (el más antiguo deja sitio al nuevo). */
const CHAT_MAXIMO_MENSAJES = 5;

/**
 * Límite de caracteres de reserva, por si el servidor todavía no ha publicado
 * su configuración (servidor/config.js -> CHAT_LONGITUD_MAXIMA).
 */
const CHAT_LONGITUD_RESERVA = 100;

/**
 * Zona del HUD del lienzo que el chat NO debe tapar.
 *
 * La tarjeta del turno ("TURNO DE") se dibuja en (16, 16) con 300x92 px de
 * mundo (js/interfaz.js -> dibujarTarjetaTurno): los mensajes empiezan justo
 * debajo, con el mismo margen lateral y un poco de aire.
 */
const CHAT_HUD_TARJETA = { x: 16, y: 16, ancho: 300, alto: 92, separacion: 10 };

class ChatDeSala {
    constructor() {
        /** Elementos del chat (se buscan en iniciar()). */
        this.capa = null;
        this.lista = null;
        this.entrada = null;
        this.campo = null;

        /** Estado. */
        this.iniciado = false;
        this.bloqueado = false;
        this.escribiendo = false;
        this.colocado = false;
        this.longitudMaxima = CHAT_LONGITUD_RESERVA;

        /** Temporizadores de cada burbuja (para poder cancelarlos). */
        this.temporizadores = new Map();
        this.liberaciones = new Map();
    }

    /**
     * =====================================================
     * ARRANQUE
     * =====================================================
     *
     * Busca los elementos y conecta los atajos y la red. Se llama una sola vez
     * desde js/main.js, al cargar la página.
     */
    iniciar() {
        if (this.iniciado) {
            return;
        }

        this.capa = document.getElementById("chat-flotante");
        this.lista = document.getElementById("chat-mensajes");
        this.entrada = document.getElementById("chat-entrada");
        this.campo = document.getElementById("chat-campo");

        if (!this.capa || !this.lista || !this.campo || !this.entrada) {
            console.warn("[CHAT] No se encontró el chat flotante (revisa index.html).");
            return;
        }

        this.iniciado = true;
        this.aplicarLimite();
        this.cerrarEntrada();

        /**
         * Atajos: ENTER o T abren la escritura.
         *
         * Se escucha en la VENTANA y en FASE DE CAPTURA a propósito: el juego
         * escucha las teclas en la ventana (js/juego.js), y en captura este
         * manejador se ejecuta antes, así que mientras se escribe el juego no
         * ve ni una tecla y los controles siguen intactos al cerrar el chat.
         */
        window.addEventListener("keydown", (evento) => this.alPulsarTecla(evento), true);

        /** Escribiendo: un clic fuera del campo cierra el chat en vez de disparar. */
        window.addEventListener("mousedown", (evento) => this.alPulsarRaton(evento), true);

        /** La posición depende del tamaño del lienzo: se recalcula al redimensionar. */
        window.addEventListener("resize", () => this.colocar());

        /** El campo pierde el foco (Tab, cambio de ventana): se cierra. */
        this.campo.addEventListener("blur", () => this.cerrarEntrada());

        /** Red: mensajes de la sala y configuración publicada por el servidor. */
        window.redJuego.al("chat", (datos) => this.recibir(datos));
        window.redJuego.al("chatConfig", (datos) => this.aplicarConfiguracion(datos));

        console.log("[CHAT] Chat flotante listo: ENTER o T para escribir.");
    }

    /**
     * =====================================================
     * ATAJOS DE TECLADO
     * =====================================================
     *
     * @param {KeyboardEvent} evento Tecla pulsada en la ventana.
     */
    alPulsarTecla(evento) {
        // Fuera de la batalla (menú, lobby, opciones) el chat no se abre: así
        // no molesta al escribir el nombre ni el código de sala.
        if (!this.iniciado || !this.enBatalla()) {
            return;
        }

        // Escribiendo: el juego no debe ver NINGUNA tecla.
        if (this.escribiendo) {
            if (this.esTecla(evento, "Enter")) {
                this.bloquearEvento(evento);
                this.enviar();
                return;
            }

            if (this.esTecla(evento, "Escape")) {
                this.bloquearEvento(evento);
                this.cerrarEntrada();
                return;
            }

            // El resto de las teclas siguen escribiendo en el campo (eso lo
            // hace el navegador), pero nunca llegan al juego.
            this.detenerPropagacion(evento);
            return;
        }

        // Fuera del modo escritura solo interesan ENTER y T.
        if (!this.esTecla(evento, "Enter") && !this.esTecla(evento, "t")) {
            return;
        }

        // Nunca mientras se escribe en otro campo (nombre, código de sala...).
        if (this.esOtroCampo(evento.target)) {
            return;
        }

        if (this.bloqueado) {
            return;
        }

        this.bloquearEvento(evento);
        this.abrirEntrada();
    }

    /**
     * =====================================================
     * ATAJOS DE RATÓN
     * =====================================================
     *
     * @param {MouseEvent} evento Clic en la ventana.
     */
    alPulsarRaton(evento) {
        if (!this.iniciado || !this.escribiendo) {
            return;
        }

        // Clic dentro del campo (colocar el cursor, seleccionar...): normal.
        if (this.entrada && typeof this.entrada.contains === "function" && this.entrada.contains(evento.target)) {
            return;
        }

        // Clic fuera: se cierra el chat y ese clic NO llega al juego, así que no
        // dispara nada por accidente.
        this.bloquearEvento(evento);
        this.cerrarEntrada();
    }

    /**
     * ¿Está el jugador en la pantalla de batalla?
     *
     * @returns {boolean}
     */
    enBatalla() {
        const pantalla = document.getElementById("pantalla-juego");

        return Boolean(pantalla) && pantalla.hidden === false;
    }

    /**
     * ¿La tecla pulsada es la indicada? (vale la letra o su código)
     *
     * @param {KeyboardEvent} evento Tecla pulsada.
     * @param {string} tecla "enter", "escape", "t"...
     * @returns {boolean}
     */
    esTecla(evento, tecla) {
        const buscada = String(tecla).toLowerCase();
        const pulsada = String(evento.key || "").toLowerCase();
        const codigo = String(evento.code || "").toLowerCase();

        return pulsada === buscada || codigo === `key${buscada}`;
    }

    /**
     * ¿Se está escribiendo en OTRO campo de la página?
     *
     * @param {HTMLElement} destino Elemento que tenía el foco.
     * @returns {boolean}
     */
    esOtroCampo(destino) {
        if (!destino || !destino.tagName) {
            return false;
        }

        const etiqueta = String(destino.tagName).toUpperCase();

        return etiqueta === "INPUT" || etiqueta === "TEXTAREA" ||
            etiqueta === "SELECT" || Boolean(destino.isContentEditable);
    }

    /**
     * Impide la acción por defecto del navegador y que el evento siga
     * avanzando (el juego no lo ve).
     *
     * @param {Event} evento Evento del navegador.
     */
    bloquearEvento(evento) {
        if (evento.preventDefault) {
            evento.preventDefault();
        }

        this.detenerPropagacion(evento);
    }

    /**
     * Corta la propagación sin impedir la acción por defecto (así se puede
     * seguir escribiendo en el campo).
     *
     * @param {Event} evento Evento del navegador.
     */
    detenerPropagacion(evento) {
        if (evento.stopImmediatePropagation) {
            evento.stopImmediatePropagation();
        } else if (evento.stopPropagation) {
            evento.stopPropagation();
        }
    }

    /**
     * =====================================================
     * ESCRIBIR
     * =====================================================
     */

    /**
     * Muestra el campo de escritura (ENTER o T) y le da el foco.
     */
    abrirEntrada() {
        if (!this.iniciado || this.bloqueado || this.escribiendo) {
            return;
        }

        this.escribiendo = true;
        this.entrada.hidden = false;
        this.campo.value = "";

        if (typeof this.campo.focus === "function") {
            this.campo.focus();
        }

        this.colocar();
    }

    /**
     * Oculta el campo de escritura y devuelve el control al juego.
     */
    cerrarEntrada() {
        this.escribiendo = false;

        if (this.entrada) {
            this.entrada.hidden = true;
        }

        if (this.campo) {
            this.campo.value = "";
        }

        this.soltarFoco();
    }

    /**
     * Envía lo escrito y oculta el campo inmediatamente.
     *
     * No se envían mensajes vacíos: se quitan los espacios del principio y del
     * final y, si no queda texto, el campo se cierra sin mandar nada.
     */
    enviar() {
        if (!this.iniciado || this.bloqueado || !this.campo) {
            return;
        }

        const texto = String(this.campo.value || "").trim().slice(0, this.longitudMaxima);

        this.cerrarEntrada();

        if (!texto) {
            return;
        }

        window.redJuego.enviarChat(texto, (respuesta) => {
            if (respuesta && respuesta.ok === false) {
                this.mostrarSistema(respuesta.mensaje || "El mensaje no se pudo enviar.");
            }
        });
    }

    /**
     * Quita el foco del campo para volver a controlar al pollito con el teclado.
     */
    soltarFoco() {
        if (this.campo && typeof this.campo.blur === "function") {
            this.campo.blur();
        }
    }

    /**
     * Aplica los límites que publica el servidor (única fuente de verdad).
     *
     * @param {object} datos { longitudMaxima, mensajesPorSegundo }
     */
    aplicarConfiguracion(datos) {
        const limite = Math.floor(Number(datos && datos.longitudMaxima));

        if (Number.isFinite(limite) && limite > 0) {
            this.longitudMaxima = limite;
            this.aplicarLimite();
        }
    }

    /**
     * Lleva el límite al campo de texto.
     *
     * Es la primera barrera (el atributo maxlength); la de verdad está en el
     * servidor, que recorta cualquier mensaje más largo.
     */
    aplicarLimite() {
        if (this.campo) {
            this.campo.maxLength = this.longitudMaxima;
        }
    }

    /**
     * =====================================================
     * RECIBIR
     * =====================================================
     *
     * El servidor ya ha filtrado por sala: aquí solo se pinta la burbuja.
     *
     * @param {object} datos Paquete "chat:mensaje" del servidor.
     */
    recibir(datos) {
        if (!this.iniciado || !datos || typeof datos.texto !== "string") {
            return;
        }

        // Al terminar la partida no entran mensajes nuevos: los que están en
        // pantalla se apagan solos.
        if (this.bloqueado) {
            return;
        }

        const texto = datos.texto.slice(0, this.longitudMaxima);

        if (!texto) {
            return;
        }

        const propio = Boolean(datos.autorId) && datos.autorId === window.redJuego.id;

        this.mostrarMensaje({
            propio,
            nombre: datos.nombre,
            color: datos.color,
            colorNombre: datos.colorNombre,
            personajeNombre: datos.personajeNombre,
            texto,
            hora: datos.hora
        });

        if (!propio) {
            this.sonarMensaje();
        }
    }

    /**
     * Crea la burbuja de un jugador y la mete en la cascada.
     *
     * El color, el nombre y el rótulo los pone el SERVIDOR (nunca el cliente),
     * así que todos ven el mismo color para el mismo jugador.
     *
     * @param {object} datos Mensaje preparado.
     */
    mostrarMensaje(datos) {
        const burbuja = document.createElement("div");
        const punto = document.createElement("span");
        const etiqueta = document.createElement("span");
        const nombre = document.createElement("span");
        const texto = document.createElement("span");

        burbuja.className = datos.propio ? "chat-burbuja propia" : "chat-burbuja";
        burbuja.style.borderLeftColor = datos.color || "#62e6ff";
        burbuja.title = [datos.colorNombre, datos.personajeNombre, this.hora(datos.hora)]
            .filter((parte) => Boolean(parte))
            .join(" · ");

        punto.className = "chat-punto";
        punto.style.background = datos.color || "#62e6ff";

        etiqueta.className = "chat-etiqueta";
        etiqueta.textContent = `[${datos.colorNombre || "JUGADOR"}]`;
        etiqueta.style.color = datos.color || "#9fe6ff";

        nombre.className = "chat-nombre";
        nombre.textContent = `${datos.nombre || "Jugador"}:`;

        texto.className = "chat-texto";
        texto.textContent = datos.texto;

        burbuja.appendChild(punto);
        burbuja.appendChild(etiqueta);
        burbuja.appendChild(nombre);
        burbuja.appendChild(texto);

        this.insertar(burbuja, CHAT_DURACION_MENSAJE);
    }

    /**
     * Burbuja informativa del propio chat (por ejemplo "Pulsa ENTER o T", o un
     * aviso del servidor). No lleva jugador.
     *
     * @param {string} mensaje Texto a mostrar.
     * @param {number} duracion Milisegundos en pantalla.
     */
    mostrarSistema(mensaje, duracion = CHAT_DURACION_MENSAJE) {
        const burbuja = document.createElement("div");
        const texto = document.createElement("span");

        burbuja.className = "chat-burbuja sistema";

        texto.className = "chat-texto";
        texto.textContent = String(mensaje);

        burbuja.appendChild(texto);

        this.insertar(burbuja, duracion);
    }

    /**
     * =====================================================
     * CASCADA
     * =====================================================
     *
     * El mensaje nuevo entra ARRIBA y los anteriores bajan en cascada. Cuando ya
     * hay 5 en pantalla, el más antiguo deja sitio.
     *
     * @param {HTMLElement} burbuja Burbuja lista.
     * @param {number} duracion Milisegundos que se queda antes de apagarse.
     */
    insertar(burbuja, duracion) {
        if (!this.colocado) {
            this.colocar();
        }

        this.lista.insertBefore(burbuja, this.lista.firstChild || null);

        while (this.cantidadVisible() > CHAT_MAXIMO_MENSAJES) {
            this.quitar(this.ultimoVisible());
        }

        if (duracion > 0) {
            const temporizador = setTimeout(() => this.quitar(burbuja), duracion);

            this.temporizadores.set(burbuja, temporizador);
        }
    }

    /**
     * Burbujas visibles, de la más nueva a la más antigua (sin contar las que
     * ya se están apagando).
     *
     * @returns {HTMLElement[]}
     */
    visibles() {
        return Array.prototype.filter.call(
            this.lista.children,
            (hijo) => !hijo.classList.contains("saliendo")
        );
    }

    /**
     * Cuántas burbujas están todavía visibles.
     *
     * @returns {number}
     */
    cantidadVisible() {
        return this.visibles().length;
    }

    /**
     * La burbuja más antigua que sigue visible.
     *
     * @returns {HTMLElement|null}
     */
    ultimoVisible() {
        const visibles = this.visibles();

        return visibles.length ? visibles[visibles.length - 1] : null;
    }

    /**
     * Apaga una burbuja con la animación de salida (opacidad + translateY) y la
     * quita del DOM al terminar. Nunca se borra de golpe.
     *
     * @param {HTMLElement} burbuja Burbuja a apagar.
     */
    quitar(burbuja) {
        if (!burbuja || !burbuja.classList || burbuja.classList.contains("saliendo")) {
            return;
        }

        this.olvidar(burbuja);
        burbuja.classList.add("saliendo");

        const liberar = setTimeout(() => this.retirar(burbuja), CHAT_DURACION_SALIDA);

        this.liberaciones.set(burbuja, liberar);
    }

    /**
     * Saca la burbuja del DOM (ya invisible).
     *
     * @param {HTMLElement} burbuja Burbuja a retirar.
     */
    retirar(burbuja) {
        this.olvidar(burbuja);

        const posicion = Array.prototype.indexOf.call(this.lista.children, burbuja);

        if (posicion >= 0) {
            this.lista.removeChild(burbuja);
        }
    }

    /**
     * Cancela los temporizadores de una burbuja.
     *
     * @param {HTMLElement} burbuja Burbuja.
     */
    olvidar(burbuja) {
        const espera = this.temporizadores.get(burbuja);
        const liberar = this.liberaciones.get(burbuja);

        if (espera) {
            clearTimeout(espera);
            this.temporizadores.delete(burbuja);
        }

        if (liberar) {
            clearTimeout(liberar);
            this.liberaciones.delete(burbuja);
        }
    }

    /**
     * Sonido al recibir un mensaje.
     *
     * Se reutiliza el efecto de interfaz que YA existe en el juego
     * (assets/sonidos/efectos/interfaz/seleccionar_boton_menu.mp3). Si el
     * sistema de sonido no lo tuviera, no suena nada: no se añade ningún
     * archivo de audio nuevo.
     */
    sonarMensaje() {
        if (window.sonidoJuego && typeof window.sonidoJuego.reproducirSonidoBoton === "function") {
            window.sonidoJuego.reproducirSonidoBoton();
        }
    }

    /**
     * Hora legible de un mensaje (para el tooltip de cada burbuja).
     *
     * @param {number} marca Marca de tiempo que envía el servidor.
     * @returns {string}
     */
    hora(marca) {
        const fecha = new Date(Number(marca) || Date.now());

        if (typeof fecha.toLocaleTimeString !== "function") {
            return "";
        }

        return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    /**
     * =====================================================
     * ESTADO DE LA PARTIDA
     * =====================================================
     */

    /**
     * Quita todos los mensajes de golpe.
     *
     * Se usa al cambiar de sala o al empezar otra partida: los mensajes
     * anteriores eran de otra conversación.
     */
    limpiar() {
        if (!this.iniciado) {
            return;
        }

        this.cerrarEntrada();

        Array.prototype.slice.call(this.lista.children).forEach((burbuja) => this.olvidar(burbuja));

        this.temporizadores.clear();
        this.liberaciones.clear();

        while (this.lista.firstChild) {
            this.lista.removeChild(this.lista.firstChild);
        }
    }

    /**
     * Fin de la partida: no se puede escribir y no entran mensajes nuevos, pero
     * los que están en pantalla se apagan solos (no se borran de golpe y no se
     * quedan encima de la pantalla de victoria/derrota para siempre).
     */
    bloquear() {
        this.bloqueado = true;
        this.cerrarEntrada();
    }

    /**
     * Vuelve a permitir escribir (partida nueva o revancha).
     */
    habilitar() {
        this.bloqueado = false;
    }

    /**
     * Empieza una partida (o una revancha): limpia, se coloca y avisa de cómo
     * escribir en el chat. Ese aviso se va solo, como cualquier mensaje.
     */
    iniciarPartida() {
        if (!this.iniciado) {
            return;
        }

        this.limpiar();
        this.habilitar();
        this.colocar();
        this.mostrarSistema("Pulsa ENTER o T para escribir al chat", 5200);

        console.log("[CHAT] Chat flotante preparado para la partida.");
    }

    /**
     * =====================================================
     * POSICIÓN
     * =====================================================
     *
     * Coloca la capa justo debajo del HUD "TURNO DE".
     *
     * El lienzo se dibuja a 1200x600 y se escala con object-fit: contain (puede
     * quedar con franjas negras), así que la posición se calcula con la caja
     * real del lienzo: los mensajes caen siempre bajo la tarjeta del turno, sea
     * cual sea el tamaño de la ventana, y nunca la tapan.
     */
    colocar() {
        if (!this.iniciado) {
            return;
        }

        const lienzo = document.getElementById("canvas-juego");

        if (!lienzo || typeof lienzo.getBoundingClientRect !== "function") {
            return;
        }

        const caja = lienzo.getBoundingClientRect();
        const ancho = Number(lienzo.width) || 1200;
        const alto = Number(lienzo.height) || 600;

        if (!caja.width || !caja.height || !ancho || !alto) {
            return;
        }

        const escala = Math.min(caja.width / ancho, caja.height / alto);
        const margenX = (caja.left || 0) + (caja.width - ancho * escala) / 2;
        const margenY = (caja.top || 0) + (caja.height - alto * escala) / 2;

        this.capa.style.left = `${Math.round(margenX + CHAT_HUD_TARJETA.x * escala)}px`;
        this.capa.style.top = `${Math.round(
            margenY + (CHAT_HUD_TARJETA.y + CHAT_HUD_TARJETA.alto + CHAT_HUD_TARJETA.separacion) * escala
        )}px`;
        this.capa.style.maxWidth = `${Math.round(Math.min(ancho * escala * 0.55, 480))}px`;

        this.colocado = true;
    }
}

/**
 * Instancia única del chat.
 *
 * El resto del proyecto utiliza:
 *
 * window.chatDeSala
 *
 * Por eso mantenemos exactamente ese nombre.
 */
window.chatDeSala = new ChatDeSala();

/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Control de pantallas y lobby
 * =========================================================
 *
 * Une la interfaz (HTML/CSS) con la red (red.js) y el juego (juego.js):
 *  - Menú principal (JUGAR, CREAR SALA, UNIRSE A SALA, OPCIONES, SALIR).
 *  - Sala de espera de seis espacios con personaje y estado "listo".
 *  - Arranque de la partida y pantalla final con estadísticas.
 *  - Avisos flotantes de conexión, desconexión y errores.
 *
 * Aquí NO hay ninguna regla de juego: todo lo decide el servidor.
 *
 * CAMBIOS DE ESTA VERSIÓN (problemas corregidos):
 *  - Se eliminó por completo CRÉDITOS (botón, pantalla, evento y referencias).
 *  - Se añadió SALIR y una pantalla de despedida.
 *  - CREAR SALA y UNIRSE A SALA ahora esperan a la conexión y avisan del
 *    resultado real (sala creada con su código o error explicado).
 *  - El estado de la conexión se refresca cada segundo, así que ya no se queda
 *    en "Conectando..." para siempre.
 */

/** Pantallas disponibles y su elemento del DOM (no hay pantalla de créditos). */
const Pantallas = {
    menu: document.getElementById("menu-principal"),
    unirse: document.getElementById("pantalla-unirse"),
    opciones: document.getElementById("pantalla-opciones"),
    salida: document.getElementById("pantalla-salida"),
    lobby: document.getElementById("pantalla-lobby"),
    juego: document.getElementById("pantalla-juego")
};

let estadoSala = null; // Último paquete del lobby.
let juego = null; // Instancia de juego del cliente.
let estoyListo = false;
let entradaEnCurso = false; // Evita dobles clics al crear o unirse a una sala.

/* ---------------------------------------------------------
   Pantallas
   --------------------------------------------------------- */

/**
 * Muestra una pantalla y oculta el resto.
 *
 * @param {string} nombre Clave de Pantallas.
 */
function mostrarPantalla(nombre) {
    Object.entries(Pantallas).forEach(([clave, elemento]) => {
        if (elemento) {
            elemento.hidden = clave !== nombre;
        }
    });

    if (nombre !== "juego") {
        document.getElementById("pantalla-final").hidden = true;

        // Las pantallas de menú comparten la música del menú principal.
        if (nombre === "salida") {
            window.sonidoJuego.detenerMusica();
        } else {
            window.sonidoJuego.reproducirMusicaMenu();
        }
    }

    if (nombre === "opciones") {
        rellenarOpciones();
    }
}

/**
 * Vuelve al menú principal y abandona cualquier sala o partida.
 */
function volverAlMenu() {
    detenerJuego();

    if (window.redJuego.codigo) {
        window.redJuego.salirSala();
    }

    estadoSala = null;
    estoyListo = false;
    mostrarPantalla("menu");
}

/* ---------------------------------------------------------
   Avisos flotantes y estado de conexión
   --------------------------------------------------------- */

/**
 * Muestra un aviso flotante temporal.
 *
 * @param {string} mensaje Texto del aviso.
 * @param {string} tipo "info", "exito" o "error".
 */
function avisar(mensaje, tipo = "info") {
    const contenedor = document.getElementById("avisos");
    const aviso = document.createElement("div");
    aviso.className = `aviso ${tipo}`;
    aviso.textContent = mensaje;
    contenedor.appendChild(aviso);

    setTimeout(() => {
        aviso.classList.add("aviso-saliendo");
        setTimeout(() => aviso.remove(), 320);
    }, 3600);
}

/**
 * Actualiza el texto de estado de conexión del menú.
 *
 * @param {string} texto Texto a mostrar.
 * @param {string} clase "conectado", "error" o "".
 */
function estadoConexion(texto, clase = "") {
    const elemento = document.getElementById("estado-conexion");
    elemento.textContent = texto;
    elemento.className = `estado-conexion ${clase}`.trim();
}

/**
 * Refresca el estado de conexión con el estado real del socket.
 *
 * Evita el clásico "Conectando con http://localhost:3210..." eterno cuando el
 * servidor está apagado.
 */
function refrescarEstadoConexion() {
    const red = window.redJuego;

    if (red.conectado) {
        estadoConexion(`Servidor conectado (${red.url}).`, "conectado");
        return;
    }

    if (red.estado === "error") {
        estadoConexion(`${red.mensajeEstado} Inícialo con "npm run server".`, "error");
        return;
    }

    estadoConexion(red.mensajeEstado);
}

/* ---------------------------------------------------------
   Nombre del jugador
   --------------------------------------------------------- */

/**
 * Lee y valida el nombre escrito en el menú.
 *
 * @returns {string|null} Nombre válido o null.
 */
function leerNombre() {
    const entrada = document.getElementById("nombre-jugador");
    const nombre = entrada.value.trim().slice(0, 18);

    if (nombre.length < 1) {
        estadoConexion("Escribe un nombre para continuar.", "error");
        entrada.focus();
        return null;
    }

    OpcionesJuego.guardarNombre(nombre);
    return nombre;
}

/**
 * Reacciona a la respuesta de entrar en una sala (crear, unirse o rápida).
 *
 * @param {object} respuesta Respuesta del servidor.
 * @param {string} modo "crear", "unir" o "rapida".
 */
function manejarEntrada(respuesta, modo = "rapida") {
    entradaEnCurso = false;

    if (!respuesta || !respuesta.ok) {
        const mensaje = respuesta && respuesta.mensaje ? respuesta.mensaje : "No se pudo entrar en la sala.";
        estadoConexion(mensaje, "error");
        avisar(mensaje, "error");
        return;
    }

    estoyListo = false;

    const avisoSala = document.getElementById("aviso-sala");
    const codigo = respuesta.codigo;
    const jugadores = respuesta.jugadores || 1;

    if (modo === "crear") {
        avisoSala.textContent = "SALA CREADA";
        avisar(`SALA CREADA · Código: ${codigo} · Jugadores: ${jugadores}/6`, "exito");
        console.log(`[MENU] Sala creada: ${codigo}. Comparte este código para que entren los demás.`);
    } else if (modo === "unir") {
        avisoSala.textContent = "TE HAS UNIDO A LA SALA";
        avisar(`Te uniste a la sala ${codigo} · Jugadores: ${jugadores}/6`, "exito");
    } else {
        avisoSala.textContent = "SALA DE ESPERA";
        avisar(`Entraste en la sala ${codigo} · Jugadores: ${jugadores}/6`, "exito");
    }

    estadoConexion(`Dentro de la sala ${codigo}`, "conectado");
    mostrarPantalla("lobby");
}

/**
 * Comprueba que haya nombre y conexión antes de pedir una sala.
 *
 * @returns {string|null} Nombre válido o null.
 */
function prepararEntrada() {
    const nombre = leerNombre();

    if (!nombre) {
        return null;
    }

    if (entradaEnCurso) {
        avisar("Ya se está entrando en una sala...", "info");
        return null;
    }

    if (!window.redJuego.conectado) {
        avisar("Conectando con el servidor... espera un instante.", "info");
    }

    entradaEnCurso = true;
    return nombre;
}

/* ---------------------------------------------------------
   Menú principal
   --------------------------------------------------------- */

document.getElementById("nombre-jugador").value = OpcionesJuego.leerNombre();

// JUGAR: partida rápida (usa el sistema de salas existente).
document.getElementById("btn-jugar-online").addEventListener("click", async () => {
    const nombre = prepararEntrada();

    if (!nombre) {
        return;
    }

    estadoConexion("Buscando partida...");
    manejarEntrada(await window.redJuego.entrarRapido(nombre), "rapida");
});

// CREAR SALA: crea una sala real en el servidor y da el código.
document.getElementById("btn-crear-sala").addEventListener("click", async () => {
    const nombre = prepararEntrada();

    if (!nombre) {
        return;
    }

    estadoConexion("Creando sala en el servidor...");
    manejarEntrada(await window.redJuego.crearSala(nombre), "crear");
});

// UNIRSE A SALA: pantalla para escribir el código.
document.getElementById("btn-ir-unirse").addEventListener("click", () => {
    document.getElementById("error-unirse").textContent = "";
    mostrarPantalla("unirse");
    document.getElementById("codigo-sala").focus();
});

// OPCIONES.
document.getElementById("btn-ir-opciones").addEventListener("click", () => mostrarPantalla("opciones"));

// SALIR: abandona la sala, corta el audio y muestra la despedida.
document.getElementById("btn-salir").addEventListener("click", () => {
    if (window.redJuego.codigo) {
        window.redJuego.salirSala();
    }

    detenerJuego();
    estadoSala = null;

    if (estadoConexion) {
        estadoConexion(`Servidor conectado (${window.redJuego.url}).`, "conectado");
    }

    mostrarPantalla("salida");
});

// VOLVER A JUGAR desde la pantalla de despedida.
document.getElementById("btn-volver-a-jugar").addEventListener("click", volverAlMenu);

// ENTRAR EN LA SALA con el código escrito.
document.getElementById("btn-unirse").addEventListener("click", async () => {
    const nombre = leerNombre();
    const codigo = document.getElementById("codigo-sala").value.toUpperCase().trim();
    const error = document.getElementById("error-unirse");

    if (!nombre) {
        mostrarPantalla("menu");
        return;
    }

    if (codigo.length < 4) {
        error.textContent = "El código tiene 4 caracteres (por ejemplo ABCD).";
        return;
    }

    if (entradaEnCurso) {
        return;
    }

    entradaEnCurso = true;
    error.textContent = "";

    const respuesta = await window.redJuego.unirSala(nombre, codigo);

    if (!respuesta.ok) {
        entradaEnCurso = false;
        error.textContent = respuesta.mensaje || "No se pudo entrar en la sala.";
        console.warn(`[MENU] No se pudo unir a la sala "${codigo}": ${respuesta.mensaje}`);
        return;
    }

    manejarEntrada(respuesta, "unir");
});

// Enter en el campo del código equivale a pulsar ENTRAR.
document.getElementById("codigo-sala").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
        document.getElementById("btn-unirse").click();
    }
});

document.querySelectorAll("[data-volver]").forEach((boton) => {
    boton.addEventListener("click", volverAlMenu);
});

// Sonido de todos los botones: un único manejador global evita duplicados.
// Cubre Jugar, Crear sala, Unirse, Opciones, Salir, Lobby, Listo,
// Iniciar partida, Copiar código, Volver y Jugar de nuevo.
document.addEventListener("click", (evento) => {
    if (evento.target.closest("button")) {
        window.sonidoJuego.reproducirSonidoBoton();
    }
});

/* ---------------------------------------------------------
   Sala de espera (lobby)
   --------------------------------------------------------- */

/**
 * Devuelve el nombre del personaje por su índice.
 *
 * @param {number} indice Índice del personaje.
 * @returns {string}
 */
function nombrePersonaje(indice) {
    const lista = (estadoSala && estadoSala.personajes) || [];
    return lista[indice] ? lista[indice].nombre : `Pollito ${indice + 1}`;
}

/**
 * Evita inyecciones de HTML con los nombres de los jugadores.
 *
 * @param {string} texto Texto original.
 * @returns {string} Texto escapado.
 */
function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Genera los botones para elegir personaje (solo en mi propio espacio).
 *
 * Cada botón muestra el DIBUJO real del pollito (no un color), así se elige
 * viendo lo que se va a ver en la arena.
 *
 * @param {object} estado Paquete del lobby.
 * @param {number} actual Personaje que tengo ahora.
 * @returns {string} HTML del selector.
 */
function crearSelectorPersonajes(estado, actual) {
    const personajes = estado.personajes || [];
    const ocupados = new Set((estado.jugadores || [])
        .filter((jugador) => jugador.id !== window.redJuego.id)
        .map((jugador) => jugador.personaje));

    const botones = personajes.map((personaje) => {
        const ocupado = ocupados.has(personaje.id);
        const clases = ["opcion-personaje"];

        if (personaje.id === actual) {
            clases.push("activo");
        }

        if (ocupado) {
            clases.push("ocupado");
        }

        const titulo = ocupado
            ? `${personaje.nombre} (elegido por otro jugador)`
            : `Elegir ${personaje.nombre}`;
        const corto = personaje.nombre.replace("Pollito ", "");
        const ruta = Recursos.rutaPollitoCompleta(personaje.id, "quieto");

        return `<button class="${clases.join(" ")}" type="button" data-personaje="${personaje.id}"
            title="${escaparHtml(titulo)}" aria-label="${escaparHtml(titulo)}"${ocupado ? " disabled" : ""}>
            <img src="${ruta}" alt="${escaparHtml(personaje.nombre)}">
            <span>${escaparHtml(corto)}</span>
        </button>`;
    }).join("");

    return `<div class="selector-personaje">${botones}</div>`;
}

/**
 * Dibuja los seis espacios del lobby.
 *
 * Cada espacio muestra: número, nombre, personaje y su estado
 * (CONECTADO, LISTO, TÚ, ESPERANDO o LIBRE).
 *
 * @param {object} estado Paquete del lobby enviado por el servidor.
 */
function dibujarLobby(estado) {
    const lista = document.getElementById("lista-jugadores");
    const maximo = estado.maxJugadores || 6;
    const jugadores = estado.jugadores || [];
    const yo = jugadores.find((jugador) => jugador.id === window.redJuego.id);

    document.getElementById("codigo-sala-lobby").textContent = estado.codigo || "----";
    document.getElementById("contador-jugadores").textContent = `${jugadores.length}/${maximo} jugadores`;

    // El estado "listo" vive en el servidor: el botón solo lo refleja.
    estoyListo = Boolean(yo && yo.listo);
    const botonListo = document.getElementById("btn-listo");
    botonListo.textContent = estoyListo ? "✔ LISTO (pulsa para cancelar)" : "ESTOY LISTO";
    botonListo.classList.toggle("boton-destacado", !estoyListo);

    document.getElementById("btn-iniciar-partida").disabled = !estado.puedeIniciar;

    lista.innerHTML = Array.from({ length: maximo }, (indice, posicion) => {
        const jugador = jugadores.find((elemento) => elemento.indice === posicion);
        const esMio = Boolean(jugador) && jugador.id === window.redJuego.id;
        const clases = ["jugador-slot"];

        if (!jugador) {
            clases.push("vacio");

            // Espacio libre: el arte del propio juego ("ESPERA") en lugar de un
            // avatar, así se ve de un vistazo quién falta por entrar.
            return `
                <article class="${clases.join(" ")}">
                    <span class="numero-slot">${posicion + 1}</span>
                    <img class="arte-espera" src="assets/imagenes/interfaz/botones/espera.png" alt="Esperando jugador">
                    <span class="insignia esperando">LIBRE</span>
                </article>`;
        }

        if (esMio) {
            clases.push("mio");
        }

        if (jugador.listo) {
            clases.push("listo");
        }

        const selector = esMio ? crearSelectorPersonajes(estado, jugador.personaje) : "";
        const estadoTexto = esMio ? "TÚ · CONECTADO" : jugador.listo ? "LISTO" : "CONECTADO";
        const retrato = Recursos.rutaPollitoCompleta(jugador.personaje, "quieto");

        return `
            <article class="${clases.join(" ")}">
                <span class="numero-slot">${posicion + 1}</span>
                <span class="avatar-arte"><img src="${retrato}" alt=""></span>
                <div>
                    <strong>${esMio ? "TÚ · " : `JUGADOR ${posicion + 1} · `}${escaparHtml(jugador.nombre)}</strong>
                    <small>${escaparHtml(nombrePersonaje(jugador.personaje))} · ${estadoTexto}</small>
                    ${selector}
                </div>
                <span class="insignia ${jugador.listo ? "listo" : "conectado"}">
                    ${esMio ? "TÚ" : jugador.listo ? "LISTO" : "CONECTADO"}
                </span>
            </article>`;
    }).join("");
}

// Cambio de personaje desde el lobby.
document.getElementById("lista-jugadores").addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-personaje]");

    if (boton) {
        window.redJuego.elegirPersonaje(Number(boton.dataset.personaje));
    }
});

document.getElementById("btn-listo").addEventListener("click", () => {
    window.redJuego.marcarListo(!estoyListo);
});

document.getElementById("btn-iniciar-partida").addEventListener("click", async () => {
    const respuesta = await window.redJuego.iniciarPartida();

    if (!respuesta.ok) {
        avisar(respuesta.mensaje || "No se pudo iniciar la partida.", "error");
        return;
    }

    console.log("[MENU] Partida iniciada: el servidor enviará el mundo completo.");
});

document.getElementById("btn-salir-sala").addEventListener("click", volverAlMenu);

document.getElementById("btn-copiar-codigo").addEventListener("click", async () => {
    const codigo = document.getElementById("codigo-sala-lobby").textContent;

    try {
        await navigator.clipboard.writeText(codigo);
        avisar(`Código ${codigo} copiado.`, "exito");
    } catch (error) {
        avisar(`Código de sala: ${codigo}`);
    }
});

/* ---------------------------------------------------------
   Opciones (sonido, música y ayudas visuales)
   --------------------------------------------------------- */

/**
 * Rellena el formulario de opciones con los valores guardados.
 *
 * El audio se lee de sonidoJuego (dueño único de las preferencias de sonido)
 * y las ayudas visuales de OpcionesJuego.
 */
function rellenarOpciones() {
    const preferencias = window.sonidoJuego.leerPreferencias();

    document.getElementById("opcion-musica-activada").checked = preferencias.musicaActivada;
    document.getElementById("opcion-efectos-activados").checked = preferencias.efectosActivados;
    document.getElementById("opcion-volumen-musica").value = Math.round(preferencias.volumenMusica * 100);
    document.getElementById("opcion-volumen-efectos").value = Math.round(preferencias.volumenEfectos * 100);

    document.getElementById("texto-volumen-musica").textContent = `${Math.round(preferencias.volumenMusica * 100)}%`;
    document.getElementById("texto-volumen-efectos").textContent = `${Math.round(preferencias.volumenEfectos * 100)}%`;

    document.getElementById("opcion-nombres").checked = OpcionesJuego.valores.mostrarNombres;
    document.getElementById("opcion-ayuda").checked = OpcionesJuego.valores.mostrarAyuda;
    document.getElementById("servidor-personalizado").value = window.redJuego.url;
}

/** Aplica los cambios de las casillas y barras de volumen. */
function aplicarOpciones() {
    const musicaActivada = document.getElementById("opcion-musica-activada").checked;
    const efectosActivados = document.getElementById("opcion-efectos-activados").checked;
    const volumenMusica = Number(document.getElementById("opcion-volumen-musica").value) / 100;
    const volumenEfectos = Number(document.getElementById("opcion-volumen-efectos").value) / 100;

    window.sonidoJuego.guardarPreferencias({
        musicaActivada,
        efectosActivados,
        volumenMusica,
        volumenEfectos
    });

    // Se aplican en caliente: la música que esté sonando cambia al momento.
    window.sonidoJuego.cambiarVolumenMusica(volumenMusica);
    window.sonidoJuego.cambiarVolumenEfectos(volumenEfectos);

    OpcionesJuego.establecer("mostrarNombres", document.getElementById("opcion-nombres").checked);
    OpcionesJuego.establecer("mostrarAyuda", document.getElementById("opcion-ayuda").checked);

    document.getElementById("texto-volumen-musica").textContent = `${Math.round(volumenMusica * 100)}%`;
    document.getElementById("texto-volumen-efectos").textContent = `${Math.round(volumenEfectos * 100)}%`;
}

["opcion-musica-activada", "opcion-efectos-activados", "opcion-volumen-musica",
    "opcion-volumen-efectos", "opcion-nombres", "opcion-ayuda"].forEach((id) => {
    document.getElementById(id).addEventListener("input", aplicarOpciones);
    document.getElementById(id).addEventListener("change", aplicarOpciones);
});

document.getElementById("btn-guardar-opciones").addEventListener("click", () => {
    aplicarOpciones();

    const servidor = document.getElementById("servidor-personalizado").value.trim().replace(/\/+$/, "");
    const servidorActual = (window.redJuego.url || "").replace(/\/+$/, "");

    if (servidor && servidor !== servidorActual) {
        try {
            window.localStorage.setItem(CONFIG_CLIENTE.CLAVE_SERVIDOR, servidor);
        } catch (error) {
            // Sin almacenamiento el cambio solo dura esta sesión.
        }

        avisar("Servidor actualizado. Recargando el juego...", "exito");
        setTimeout(() => window.location.reload(), 900);
        return;
    }

    avisar("Opciones guardadas.", "exito");
});

/* ---------------------------------------------------------
   Partida: arranque, pantalla final y eventos de red
   --------------------------------------------------------- */

/**
 * Crea el juego del cliente y muestra la pantalla de partida.
 *
 * @param {object} paquete Paquete inicial del servidor.
 */
function arrancarJuego(paquete) {
    if (!juego) {
        juego = new window.Juego(document.getElementById("canvas-juego"));

        // El final de la partida lo decide el servidor: aquí solo se muestra.
        juego.alTerminar = (paqueteFinal) => mostrarPantallaFinal(paqueteFinal);
    }

    mostrarPantalla("juego");
    juego.alRecibir(paquete);
    juego.iniciar();
}

/** Detiene y destruye el juego actual. */
function detenerJuego() {
    if (juego) {
        juego.detener();
        juego = null;
    }
}

/**
 * Muestra la pantalla de VICTORIA o DERROTA con las estadísticas.
 *
 * @param {object} paquete Estado final enviado por el servidor.
 */
function mostrarPantallaFinal(paquete) {
    const panel = document.querySelector(".panel-final");
    const titulo = document.getElementById("resultado-titulo");
    const mensaje = document.getElementById("resultado-mensaje");
    const tabla = document.getElementById("resultado-estadisticas");
    const yo = (paquete.jugadores || []).find((jugador) => jugador.id === window.redJuego.id);
    const ganador = paquete.ganador;
    const gane = Boolean(ganador) && ganador.id === window.redJuego.id;
    const vivos = (paquete.jugadores || []).filter((jugador) => jugador.vivo);

    panel.classList.toggle("derrota", !gane);

    if (ganador && gane) {
        titulo.textContent = "🏆 VICTORIA";
    } else if (ganador) {
        titulo.textContent = "💀 DERROTA";
    } else {
        titulo.textContent = "🤝 EMPATE";
    }

    const partes = [ganador ? `Ganador: ${ganador.nombre}` : "Nadie quedó en pie"];
    partes.push(yo ? `Tu vida final: ${yo.vida}` : "Fuiste eliminado");
    partes.push(`Supervivientes: ${vivos.length} de ${(paquete.jugadores || []).length}`);
    mensaje.textContent = partes.join(" · ");

    const filas = (paquete.jugadores || [])
        .slice()
        .sort((a, b) => b.estadisticas.bajas - a.estadisticas.bajas ||
            b.estadisticas.danioInfligido - a.estadisticas.danioInfligido)
        .map((jugador) => {
            const ganoEste = Boolean(ganador) && ganador.id === jugador.id;
            const clase = ganoEste ? "fila-estadistica ganador" : "fila-estadistica";
            const nombre = `${jugador.id === window.redJuego.id ? "TÚ · " : ""}${escaparHtml(jugador.nombre)}`;

            return `
                <div class="${clase}">
                    <span class="nombre">${nombre}</span>
                    <span>${jugador.vida}</span>
                    <span>${jugador.estadisticas.bajas}</span>
                    <span>${jugador.estadisticas.danioInfligido}</span>
                </div>`;
        })
        .join("");

    tabla.innerHTML = `
        <div class="fila-estadistica encabezado">
            <span class="nombre">Jugador</span>
            <span>Vida</span>
            <span>Bajas</span>
            <span>Daño</span>
        </div>
        ${filas}`;

    document.getElementById("pantalla-final").hidden = false;

    // La música de batalla se detiene y suena game over desde el evento
    // "fin-partida" (js/juego.js): aquí solo se muestra el resultado.
    console.log(`[MENU] Partida terminada. ${ganador ? `Ganador: ${ganador.nombre}` : "Sin ganador"}.`);
}

document.getElementById("btn-reiniciar").addEventListener("click", async () => {
    const respuesta = await window.redJuego.reiniciarPartida();

    if (!respuesta.ok) {
        avisar(respuesta.mensaje || "No se pudo iniciar la revancha.", "error");
        return;
    }

    // El servidor enviará un paquete "inicio" que reinicia el juego completo.
    document.getElementById("pantalla-final").hidden = true;
});

document.getElementById("btn-menu").addEventListener("click", volverAlMenu);
document.getElementById("btn-salir-partida").addEventListener("click", volverAlMenu);

/* ---------------------------------------------------------
   Suscripciones a la red
   --------------------------------------------------------- */

window.redJuego.al("conexion", (datos) => {
    estadoConexion(`Servidor conectado (${datos.url}).`, "conectado");

    // La música del menú arranca con la primera interacción del usuario.
    window.sonidoJuego.reproducirMusicaDelMenuSiProcede();
});

window.redJuego.al("desconexion", () => {
    const mensaje = "Se perdió la conexión con el servidor. Intentando reconectar...";
    estadoConexion(mensaje, "error");
    avisar(mensaje, "error");
});

window.redJuego.al("aviso", (datos) => {
    avisar(datos.mensaje, datos.tipo === "error" ? "error" : "info");
});

window.redJuego.al("sala", (paquete) => {
    estadoSala = paquete;

    // Las paletas de los personajes vienen del servidor (fuente única).
    window.paletasPersonajes = paquete.personajes || [];

    (paquete.notificaciones || []).forEach((notificacion) => {
        if (notificacion.tipo === "conexion") {
            avisar(`${notificacion.nombre} se conectó a la sala.`, "exito");
            window.sonidoJuego.reproducirEntradaDeJugador();
        } else if (notificacion.tipo === "desconexion") {
            avisar(`${notificacion.nombre} se desconectó.`, "error");
            window.sonidoJuego.reproducirSalidaDeJugador();
        }
    });

    dibujarLobby(paquete);

    // Si la partida ya había terminado y alguien sale, la sala vuelve al lobby.
    if (paquete.estado === "lobby") {
        detenerJuego();
        mostrarPantalla("lobby");
    }
});

window.redJuego.al("partida", (paquete) => {
    if (paquete.tipo === "inicio") {
        // El servidor manda el mundo completo: se reinicia todo el cliente.
        arrancarJuego(paquete);
        return;
    }

    if (juego) {
        juego.alRecibir(paquete);
    }
});

/* ---------------------------------------------------------
   Dibujos del juego y botón de sonido
   --------------------------------------------------------- */

/**
 * Refresca el icono del botón de sonido según las preferencias guardadas.
 *
 * El icono sale del arte del juego: el altavoz cuando hay sonido y la barrera
 * cuando está todo silenciado (que es justo lo que significa "bloqueado").
 */
function refrescarBotonSonido() {
    const preferencias = window.sonidoJuego.leerPreferencias();
    const silenciado = !preferencias.musicaActivada && !preferencias.efectosActivados;
    const boton = document.getElementById("btn-sonido");

    document.getElementById("icono-sonido").src = silenciado
        ? "assets/imagenes/interfaz/botones/icono_barrera.png"
        : "assets/imagenes/interfaz/botones/icono_sonido.png";

    boton.classList.toggle("silenciado", silenciado);
    boton.title = silenciado ? "Sonido silenciado: pulsa para activarlo" : "Silenciar el sonido";
}

document.getElementById("btn-sonido").addEventListener("click", () => {
    const preferencias = window.sonidoJuego.leerPreferencias();
    const silenciado = !preferencias.musicaActivada && !preferencias.efectosActivados;
    const activar = silenciado;

    // El audio tiene un único dueño (window.sonidoJuego): aquí solo se le pide.
    window.sonidoJuego.activarMusica(activar);
    window.sonidoJuego.activarEfectos(activar);

    if (activar) {
        window.sonidoJuego.reproducirMusicaDelMenuSiProcede();
        avisar("Sonido activado.", "exito");
    } else {
        window.sonidoJuego.detenerMusica();
        avisar("Sonido silenciado.", "info");
    }

    refrescarBotonSonido();
});

/**
 * Pide todos los dibujos del juego.
 *
 * No bloquea nada: los que tarden aparecen en cuanto llegan y, mientras
 * tanto, cada sistema dibuja su versión de respaldo. Se pide aquí, una sola
 * vez, para que el menú y la partida compartan las mismas imágenes.
 */
function precargarDibujos() {
    Recursos.precargarTodo();

    // Los retratos del lobby se usan en cuanto se entra en una sala: se piden
    // ya para que no aparezcan en blanco.
    (window.paletasPersonajes || []).forEach((personaje) => {
        Recursos.pedir(Recursos.rutaPollito(personaje.id, "quieto"));
    });

    console.log(`[ARTE] ${Recursos.pedidas} dibujos pedidos a assets/imagenes/.`);
}

/* ---------------------------------------------------------
   Estado inicial
   --------------------------------------------------------- */

precargarDibujos();
refrescarBotonSonido();
mostrarPantalla("menu");
refrescarEstadoConexion();

// El estado de conexión se refresca cada segundo: si el servidor está apagado
// se ve el motivo real en el menú en lugar de quedarse en "Conectando...".
setInterval(refrescarEstadoConexion, 1000);

console.log(`[MENU] Menú preparado. Servidor configurado: ${window.redJuego.url}`);

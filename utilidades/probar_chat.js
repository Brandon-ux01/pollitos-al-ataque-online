/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Prueba del chat flotante (sin navegador)
 * =========================================================
 *
 * Carga js/chat.js dentro de Node con un DOM falso (mínimo, pero suficiente) y
 * comprueba, sin abrir el navegador, todo lo que hace el chat de combate:
 *
 *  - No hay caja de chat permanente: el campo de escritura nace oculto.
 *  - Los mensajes se colocan DEBAJO del HUD "TURNO DE" y dentro de la pantalla,
 *    sea cual sea el tamaño de la ventana (se prueba con una ventana grande con
 *    franjas negras y con una pequeña).
 *  - Cascada: el mensaje nuevo entra arriba, los anteriores bajan, se ven como
 *    máximo 5 y el más antiguo deja sitio.
 *  - Cada mensaje se apaga a los 4 s (con 300 ms de animación de salida) y sale
 *    del DOM, así que nada se queda para siempre.
 *  - ENTER o T abren la escritura, ENTER envía y oculta el campo, ESCAPE y el
 *    clic fuera cierran. Los mensajes vacíos no se envían y el texto se recorta
 *    al máximo que publica el servidor.
 *  - Mientras se escribe, el juego NO recibe teclas ni clics (no se mueve el
 *    pollito ni se dispara); al cerrar, los controles vuelven a funcionar.
 *  - El color y el nombre los pone el servidor y el texto se pinta como texto
 *    plano (nunca se interpreta como HTML).
 *  - Al terminar la partida no se puede escribir ni entran mensajes nuevos.
 *
 * Uso:
 *   npm run chat
 *   node utilidades/probar_chat.js
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RAIZ = path.join(__dirname, "..");

// Configuración del servidor: única fuente de verdad (límite de caracteres).
const CONFIG = require(path.join(RAIZ, "servidor", "config.js"));

/**
 * Oyentes de la VENTANA en fase de BURBUJA: es donde escucha el juego
 * (js/juego.js) para las teclas y el botón del ratón.
 */
const registroVentana = {};

/** Oyentes de la VENTANA en fase de CAPTURA: es donde escucha el chat. */
const capturaVentana = {};

const fallos = [];

/**
 * Comprueba una condición y la registra.
 *
 * @param {boolean} condicion Resultado.
 * @param {string} descripcion Texto de la prueba.
 */
function comprobar(condicion, descripcion) {
    console.log(`  ${condicion ? "OK   " : "FALLO"} ${descripcion}`);

    if (!condicion) {
        fallos.push(descripcion);
    }
}

/**
 * Ejecuta algo y comprueba que no lanza errores.
 *
 * @param {string} descripcion Texto de la prueba.
 * @param {Function} funcion Código a ejecutar.
 */
function sinError(descripcion, funcion) {
    try {
        funcion();
        comprobar(true, descripcion);
    } catch (error) {
        comprobar(false, `${descripcion} (${error.message})`);
    }
}

/* --- Reloj falso -------------------------------------------------------- */

/**
 * Temporizadores controlados desde la prueba: así se puede comprobar que cada
 * mensaje se apaga a los 4000 ms (y 300 ms de animación) sin esperar de verdad.
 */
const reloj = {
    cola: new Map(),
    siguiente: 1,

    programar(funcion, milisegundos) {
        const id = reloj.siguiente;

        reloj.siguiente += 1;
        reloj.cola.set(id, { funcion, milisegundos: Number(milisegundos) || 0 });

        return id;
    },

    cancelar(id) {
        reloj.cola.delete(id);
    },

    /** Milisegundos de todos los temporizadores pendientes. */
    retardos() {
        return [...reloj.cola.values()].map((tarea) => tarea.milisegundos);
    },

    /** Ejecuta los temporizadores cuyo retardo entra dentro de "milisegundos". */
    avanzar(milisegundos) {
        const pendientes = [...reloj.cola.entries()]
            .filter(([, tarea]) => tarea.milisegundos <= milisegundos)
            .sort((a, b) => a[1].milisegundos - b[1].milisegundos);

        pendientes.forEach(([id, tarea]) => {
            reloj.cola.delete(id);
            tarea.funcion();
        });
    }
};

/* --- DOM falso ---------------------------------------------------------- */

/**
 * Elemento falso del DOM: guarda texto, clases, hijos y permite disparar sus
 * eventos a mano, con fase de captura y burbuja como el navegador.
 */
class ElementoFalso {
    constructor(id, etiqueta = "div") {
        this.id = id;
        this.tagName = String(etiqueta).toUpperCase();
        this.hijos = [];
        this.claseLista = new Set();
        this.style = {};
        this.eventos = {};
        this.textContent = "";
        this.value = "";
        this.title = "";
        this.placeholder = "";
        this.maxLength = 0;
        this.hidden = false;
        this.disabled = false;
        this.foco = false;
        this.padre = null;
        // Caja (getBoundingClientRect) y medidas del lienzo.
        this.caja = { left: 0, top: 0, width: 0, height: 0 };
        this.width = 0;
        this.height = 0;

        const elemento = this;

        this.classList = {
            add: (clase) => {
                elemento.claseLista.add(clase);
            },
            remove: (clase) => {
                elemento.claseLista.delete(clase);
            },
            contains: (clase) => elemento.claseLista.has(clase),
            toggle: (clase) => {
                if (elemento.claseLista.has(clase)) {
                    elemento.claseLista.delete(clase);
                    return false;
                }

                elemento.claseLista.add(clase);
                return true;
            }
        };
    }

    get className() {
        return [...this.claseLista].join(" ");
    }

    set className(valor) {
        this.claseLista = new Set(String(valor).split(/\s+/).filter(Boolean));
    }

    get children() {
        return this.hijos;
    }

    get firstChild() {
        return this.hijos.length ? this.hijos[0] : null;
    }

    getBoundingClientRect() {
        return this.caja;
    }

    appendChild(hijo) {
        this.hijos.push(hijo);
        hijo.padre = this;

        return hijo;
    }

    /**
     * Inserta un hijo antes de otro (como el DOM de verdad). Con referencia
     * nula, inserta al principio.
     */
    insertBefore(hijo, referencia) {
        const posicion = referencia ? this.hijos.indexOf(referencia) : 0;

        this.hijos.splice(posicion < 0 ? this.hijos.length : posicion, 0, hijo);
        hijo.padre = this;

        return hijo;
    }

    removeChild(hijo) {
        const posicion = this.hijos.indexOf(hijo);

        if (posicion >= 0) {
            this.hijos.splice(posicion, 1);
            hijo.padre = null;
        }

        return hijo;
    }

    contains(nodo) {
        return nodo === this || this.hijos.indexOf(nodo) >= 0;
    }

    addEventListener(tipo, manejador) {
        this.eventos[tipo] = manejador;
    }

    /**
     * Simula un evento del usuario sobre este elemento.
     *
     * Como en el navegador: primero la fase de CAPTURA de la ventana (el chat),
     * después el elemento y sus padres (burbuja) y al final la ventana (el
     * juego). Si alguien detiene la propagación, los siguientes no lo ven.
     *
     * @param {string} tipo Tipo de evento ("keydown", "click"...).
     * @param {object} extra Datos extra del evento.
     * @returns {object} El evento (para ver qué hizo el manejador).
     */
    disparar(tipo, extra = {}) {
        const evento = Object.assign({
            type: tipo,
            target: this,
            key: "",
            code: "",
            detenida: false,
            preventado: false,
            stopPropagation: () => {
                evento.detenida = true;
            },
            stopImmediatePropagation: () => {
                evento.detenida = true;
            },
            preventDefault: () => {
                evento.preventado = true;
            }
        }, extra);

        if (capturaVentana[tipo]) {
            capturaVentana[tipo](evento);
        }

        let actual = this;

        while (actual && !evento.detenida) {
            if (actual.eventos && actual.eventos[tipo]) {
                actual.eventos[tipo](evento);
            }

            actual = actual.padre || null;
        }

        if (!evento.detenida && registroVentana[tipo]) {
            registroVentana[tipo](evento);
        }

        return evento;
    }

    focus() {
        this.foco = true;
    }

    blur() {
        this.foco = false;
    }

    /** Todo el texto visible del elemento y de sus hijos. */
    textoPlano() {
        return this.textContent + this.hijos.map((hijo) => hijo.textoPlano()).join("");
    }
}

/**
 * Documento falso con los elementos del chat flotante y de la pantalla.
 *
 * @param {string[]} ids Identificadores a crear.
 * @returns {object} Documento con getElementById y createElement.
 */
function crearDocumentoFalso(ids) {
    const elementos = new Map();

    ids.forEach((id) => elementos.set(id, new ElementoFalso(id)));

    elementos.get("canvas-juego").width = 1200;
    elementos.get("canvas-juego").height = 600;
    elementos.get("pantalla-juego").hidden = false;

    return {
        elementos,
        getElementById: (id) => elementos.get(id) || null,
        createElement: (etiqueta) => new ElementoFalso(null, etiqueta),
        addEventListener: () => {}
    };
}

/* --- Red y sonido falsos ------------------------------------------------ */

/**
 * Red falsa: apunta lo que el chat pide enviar y permite simular los mensajes
 * que llegan del servidor, igual que hace js/red.js con Socket.IO.
 *
 * @returns {object} Red de prueba.
 */
function crearRedFalsa() {
    const suscriptores = {};

    const red = {
        id: "socket-1",
        enviados: [],
        /** Respuesta simulada del servidor (cada prueba puede cambiarla). */
        responder: null,

        al(evento, manejador) {
            suscriptores[evento] = suscriptores[evento] || [];
            suscriptores[evento].push(manejador);
        },

        avisar(evento, datos) {
            (suscriptores[evento] || []).forEach((manejador) => manejador(datos));
        },

        enviarChat(texto, respuesta) {
            red.enviados.push(texto);

            if (red.responder) {
                red.responder(texto, respuesta);
            }
        }
    };

    return red;
}

/* --- Entorno y carga del módulo ----------------------------------------- */

const IDS_CHAT = [
    "chat-flotante",
    "chat-mensajes",
    "chat-entrada",
    "chat-campo",
    "pantalla-juego",
    "canvas-juego"
];

const documento = crearDocumentoFalso(IDS_CHAT);
const red = crearRedFalsa();

/** Sonido falso: cuenta cuántas veces se pide el efecto de interfaz. */
const sonido = {
    veces: 0,
    reproducirSonidoBoton() {
        sonido.veces += 1;
    }
};

/**
 * Juego falso (js/juego.js): escucha las teclas en la VENTANA y el botón del
 * ratón en el lienzo. Si el chat dejara pasar un evento, estas cuentas subirían
 * y la prueba lo detectaría.
 */
const juego = {
    teclas: 0,
    raton: 0
};

registroVentana.keydown = () => {
    juego.teclas += 1;
};

registroVentana.keyup = () => {
    juego.teclas += 1;
};

const ventana = {
    document: documento,
    redJuego: red,
    sonidoJuego: sonido,
    console,
    // El chat programa aquí sus animaciones: la prueba las controla a mano.
    setTimeout: (funcion, milisegundos) => reloj.programar(funcion, milisegundos),
    clearTimeout: (id) => reloj.cancelar(id),
    addEventListener: (tipo, manejador, captura) => {
        if (captura) {
            capturaVentana[tipo] = manejador;
            return;
        }

        registroVentana[tipo] = manejador;
    }
};

ventana.window = ventana;
ventana.globalThis = ventana;

vm.createContext(ventana);
vm.runInContext(
    fs.readFileSync(path.join(RAIZ, "js", "chat.js"), "utf8"),
    ventana,
    { filename: "js/chat.js" }
);

// Las clases y constantes de un script clásico viven en el ámbito léxico del
// documento (no en el objeto global): se copian a mano para poder usarlas.
vm.runInContext(
    `globalThis.__chat = {
        ChatDeSala,
        CHAT_DURACION_MENSAJE,
        CHAT_DURACION_SALIDA,
        CHAT_MAXIMO_MENSAJES,
        CHAT_LONGITUD_RESERVA
    };`,
    ventana,
    { filename: "puente" }
);

const api = ventana.__chat;
const chat = ventana.chatDeSala;

if (!api || !chat) {
    console.error("No se pudo cargar js/chat.js");
    process.exit(1);
}

/** Fuentes del proyecto (comprobaciones de seguridad y de estructura). */
const fuenteChat = fs.readFileSync(path.join(RAIZ, "js", "chat.js"), "utf8");
const fuenteHtml = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");

/* --- Elementos y ayudas ------------------------------------------------- */

const capa = documento.elementos.get("chat-flotante");
const lista = documento.elementos.get("chat-mensajes");
const entrada = documento.elementos.get("chat-entrada");
const campo = documento.elementos.get("chat-campo");
const pantallaJuego = documento.elementos.get("pantalla-juego");
const lienzo = documento.elementos.get("canvas-juego");

/** Falso lienzo "del juego": aquí es donde el clic carga y dispara el cañón. */
const superficieJuego = new ElementoFalso("superficie-juego", "div");

superficieJuego.addEventListener("mousedown", () => {
    juego.raton += 1;
});

/** Simula el tamaño de la ventana (y con ello el del lienzo dibujado). */
function medirVentana(ancho, alto) {
    lienzo.caja = { left: 0, top: 0, width: ancho, height: alto };
}

/** Convierte "249px" en 249. */
function enPx(valor) {
    return Number(String(valor || "0").replace("px", ""));
}

/** Burbujas que se ven ahora mismo (sin contar las que ya se están apagando). */
function visibles() {
    return lista.children.filter((burbuja) => !burbuja.classList.contains("saliendo"));
}

/** Mensaje del servidor tal y como llega (el color y el nombre los pone él). */
function deJugador(indice, texto) {
    const color = CONFIG.COLORES_JUGADOR[indice % CONFIG.COLORES_JUGADOR.length];

    return {
        tipo: "mensaje",
        autorId: `socket-${indice + 2}`,
        nombre: `Brandon${indice + 2}`,
        personaje: indice,
        personajeNombre: `Pollito ${indice + 1}`,
        color: color.color,
        colorNombre: color.nombre,
        texto,
        hora: Date.now()
    };
}

/** Posición que le toca al chat según el tamaño de la ventana. */
function posicionEsperada(ancho, alto) {
    const escala = Math.min(ancho / 1200, alto / 600);
    const margenY = (alto - 600 * escala) / 2;

    return {
        escala,
        izquierda: 16 * escala,
        arriba: margenY + (16 + 92 + 10) * escala,
        debajoDelHud: margenY + (16 + 92) * escala
    };
}

/* ---------------------------------------------------------
   Prueba
   --------------------------------------------------------- */

console.log("");
console.log("=========================================================");
console.log("  PRUEBA DEL CHAT FLOTANTE DE COMBATE (sin navegador)");
console.log("=========================================================");
console.log("");
console.log("== ARRANQUE: SIN CAJA DE CHAT PERMANENTE ==");

sinError("el chat se prepara sin errores", () => chat.iniciar());

comprobar(chat.iniciado === true, "el chat flotante queda listo (iniciar)");
comprobar(entrada.hidden === true, "no hay caja de chat permanente: el campo de escritura nace oculto");
comprobar(lista.children.length === 0, "al arrancar no hay ningún mensaje acumulado");
comprobar(campo.maxLength === CONFIG.CHAT_LONGITUD_MAXIMA,
    `el campo usa el límite del servidor (${campo.maxLength} caracteres)`);

// El límite lo publica el servidor: se prueba con otro valor para demostrar que
// el cliente lo aplica de verdad y no usa una copia propia.
red.avisar("chatConfig", { longitudMaxima: 42 });

comprobar(campo.maxLength === 42, "la configuración que publica el servidor se aplica al campo");

red.avisar("chatConfig", {
    longitudMaxima: CONFIG.CHAT_LONGITUD_MAXIMA,
    mensajesPorSegundo: CONFIG.CHAT_MENSAJES_POR_SEGUNDO
});

comprobar(campo.maxLength === CONFIG.CHAT_LONGITUD_MAXIMA,
    `el campo vuelve al límite real (${CONFIG.CHAT_LONGITUD_MAXIMA} caracteres)`);

comprobar(!/chat-historial|chat-panel|chat-enviar/.test(fuenteChat) &&
    !/chat-historial|chat-panel|chat-enviar/.test(fuenteHtml),
    "no queda ningún panel ni historial del chat anterior (ni en el HTML ni en el JS)");
comprobar(/id="chat-entrada"[^>]*hidden/.test(fuenteHtml),
    "en index.html el campo de escritura nace oculto (atributo hidden)");

console.log("");
console.log("== POSICIÓN: PARTE SUPERIOR IZQUIERDA, BAJO EL HUD \"TURNO DE\" ==");

medirVentana(1920, 1080);
chat.colocar();

const grande = posicionEsperada(1920, 1080);

comprobar(enPx(capa.style.left) === Math.round(grande.izquierda) &&
    enPx(capa.style.top) === Math.round(grande.arriba),
    `en 1920x1080 el chat va arriba a la izquierda (${capa.style.left}, ${capa.style.top})`);
comprobar(enPx(capa.style.top) > Math.round(grande.debajoDelHud),
    `los mensajes empiezan por debajo del HUD "TURNO DE" (${capa.style.top} > ${Math.round(grande.debajoDelHud)}px)`);
comprobar(enPx(capa.style.top) > 0 && enPx(capa.style.top) < 1080 && enPx(capa.style.left) >= 0,
    "el chat queda dentro de la pantalla (no se sale por ningún lado)");
comprobar(enPx(capa.style.maxWidth) <= 480, `el ancho máximo está limitado (${capa.style.maxWidth})`);

medirVentana(1366, 768);
chat.colocar();

const pequena = posicionEsperada(1366, 768);

comprobar(enPx(capa.style.top) > Math.round(pequena.debajoDelHud) && enPx(capa.style.left) >= 0 &&
    enPx(capa.style.top) < 768,
    `en 1366x768 sigue debajo del HUD (${capa.style.top}) y sin salirse de la pantalla`);

medirVentana(1280, 720);
chat.colocar();

const baja = posicionEsperada(1280, 720);

comprobar(enPx(capa.style.top) > Math.round(baja.debajoDelHud) && enPx(capa.style.top) < 720,
    `en 1280x720 también (${capa.style.top})`);

medirVentana(1920, 1080);
chat.colocar();

console.log("");
console.log("== CASCADA: EL NUEVO ARRIBA, LOS DEMÁS BAJAN ==");

sinError("empieza una partida", () => chat.iniciarPartida());

comprobar(lista.children.length === 1, "al empezar la partida solo aparece el aviso de cómo escribir");
comprobar(reloj.retardos().includes(5200), "el aviso de ayuda se apaga solo");
comprobar(entrada.hidden === true, "el aviso no abre ninguna caja de chat");

red.avisar("chat", deJugador(0, "¡Toma esto!"));

comprobar(lista.children.length === 2, "el mensaje de un jugador aparece en pantalla");

const primera = lista.children[0];

comprobar(primera.classList.contains("chat-burbuja") && primera.textoPlano().includes("[ROJO]") &&
    primera.textoPlano().includes("Brandon2") && primera.textoPlano().includes("¡Toma esto!"),
    "la burbuja muestra [COLOR], el nombre y el texto ([ROJO] Brandon2: ¡Toma esto!)");
comprobar(primera.children[1].style.color === CONFIG.COLORES_JUGADOR[0].color &&
    primera.style.borderLeftColor === CONFIG.COLORES_JUGADOR[0].color,
    "el color del jugador (rótulo y borde) es el que manda el servidor");
comprobar(primera.children[3].textContent === "¡Toma esto!" && primera.children[3].hijos.length === 0,
    "el texto del mensaje queda como texto plano");
comprobar(reloj.retardos().includes(api.CHAT_DURACION_MENSAJE),
    `cada mensaje se apaga a los ${api.CHAT_DURACION_MENSAJE} ms (unos 4 s)`);
comprobar(sonido.veces === 1, "suena el efecto de interfaz que ya existía al recibir un mensaje");

red.avisar("chat", deJugador(1, "¡Buen disparo!"));

comprobar(lista.children[0].textoPlano().includes("¡Buen disparo!") && lista.children[1] === primera,
    "el mensaje nuevo entra arriba y el anterior baja (cascada)");

red.avisar("chat", deJugador(1, "otra vez"));

comprobar(lista.children[2] === primera && lista.children.length === 4,
    "los mensajes siguen bajando en cascada");

const propio = Object.assign(deJugador(5, "¿Quién sigue?"), {
    autorId: red.id,
    nombre: "Brandon1"
});

red.avisar("chat", propio);

comprobar(lista.children[0].classList.contains("propia"), "los mensajes propios se distinguen de los demás");
comprobar(sonido.veces === 3, "no suena el efecto con los mensajes propios (solo con los de los demás)");

const html = '<script>alert("hola")</script>';

red.avisar("chat", deJugador(2, html));

comprobar(lista.children[0].textoPlano().includes(html) && lista.children[0].children[3].hijos.length === 0,
    '<script>alert("hola")</script> se ve literalmente (no se ejecuta)');
comprobar(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(fuenteChat),
    "js/chat.js nunca usa innerHTML (el texto no puede convertirse en HTML)");

[3, 4, 5, 0, 1].forEach((indice, orden) => {
    red.avisar("chat", deJugador(indice, `mensaje extra ${orden}`));
});

comprobar(visibles().length === api.CHAT_MAXIMO_MENSAJES,
    `nunca se ven más de ${api.CHAT_MAXIMO_MENSAJES} mensajes a la vez (hay ${visibles().length})`);
comprobar(!visibles().some((burbuja) => burbuja.textoPlano().includes("¡Toma esto!")),
    "el mensaje más antiguo deja sitio cuando llega el sexto");

console.log("");
console.log("== DURACIÓN Y ANIMACIÓN DE SALIDA ==");

const cuantasAntes = lista.children.length;
const masViejo = visibles()[visibles().length - 1];

reloj.avanzar(api.CHAT_DURACION_MENSAJE);

comprobar(masViejo.classList.contains("saliendo"),
    `a los ${api.CHAT_DURACION_MENSAJE} ms el mensaje empieza a apagarse (opacidad + translateY)`);
comprobar(lista.children.includes(masViejo), "no se borra de golpe: primero se apaga");
comprobar(reloj.retardos().includes(api.CHAT_DURACION_SALIDA),
    `la animación de salida dura ${api.CHAT_DURACION_SALIDA} ms`);

reloj.avanzar(api.CHAT_DURACION_SALIDA);

comprobar(!lista.children.includes(masViejo), "al terminar la animación el mensaje sale del DOM");
comprobar(lista.children.length < cuantasAntes, "el espacio vuelve a quedar libre solo");

reloj.avanzar(10000);

comprobar(visibles().length === 0, "todos los mensajes acaban apagándose (nada se queda para siempre)");

reloj.avanzar(api.CHAT_DURACION_SALIDA);

comprobar(lista.children.length === 0, "y salen del DOM: en pantalla no queda nada colgado");

console.log("");
console.log("== ESCRIBIR: SOLO CUANDO EL JUGADOR QUIERE ==");

// Como en index.html: el campo está dentro del bloque de escritura.
entrada.appendChild(campo);

const teclasAntes = juego.teclas;
const ratonAntes = juego.raton;

campo.disparar("keydown", { key: "Enter", code: "Enter" });

comprobar(chat.escribiendo === true && entrada.hidden === false,
    "ENTER abre el campo (la caja solo aparece cuando se va a escribir)");
comprobar(campo.foco === true, "el campo recibe el foco para escribir directamente");
comprobar(juego.teclas === teclasAntes, "abrir el chat no manda esa tecla al juego");

campo.disparar("keydown", { key: "Escape", code: "Escape" });

comprobar(chat.escribiendo === false && entrada.hidden === true, "ESCAPE cierra el chat y oculta el campo");

campo.disparar("keydown", { key: "t", code: "KeyT" });

comprobar(chat.escribiendo === true, "T también abre el campo de escritura");

const teclasAlEscribir = juego.teclas;

campo.disparar("keydown", { key: "w", code: "KeyW" });
campo.disparar("keydown", { key: " ", code: "Space" });

comprobar(juego.teclas === teclasAlEscribir,
    "mientras se escribe el juego NO recibe teclas (el pollito no se mueve ni salta)");

// Los keyup SÍ se dejan pasar a propósito: así ninguna tecla se queda pegada
// (si se soltaba una tecla mientras se escribe, el pollito seguiría andando).
campo.disparar("keyup", { key: "w", code: "KeyW" });

comprobar(juego.teclas === teclasAlEscribir + 1,
    "los keyup sí llegan al juego para que no se quede ninguna tecla pegada");

superficieJuego.disparar("mousedown");

comprobar(chat.escribiendo === false, "un clic fuera del campo cierra el chat");
comprobar(juego.raton === ratonAntes, "y ese clic NO llega al juego (no dispara por accidente)");

campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.disparar("mousedown");

comprobar(chat.escribiendo === true, "un clic dentro del campo no cierra el chat");

campo.disparar("keydown", { key: "Escape", code: "Escape" });
pantallaJuego.hidden = true;
campo.disparar("keydown", { key: "T", code: "KeyT" });

comprobar(chat.escribiendo === false, "fuera de la batalla (menú, lobby) el chat no se abre");

pantallaJuego.hidden = false;

campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.value = "¡Prepárate!";
campo.disparar("keydown", { key: "Enter", code: "Enter" });

comprobar(red.enviados[red.enviados.length - 1] === "¡Prepárate!", "ENTER envía el mensaje escrito");
comprobar(entrada.hidden === true && campo.value === "", "el campo se oculta y se limpia inmediatamente al enviar");

campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.value = "   ¡Casi!   ";
campo.disparar("keydown", { key: "Enter", code: "Enter" });

comprobar(red.enviados[red.enviados.length - 1] === "¡Casi!", "se quitan los espacios del principio y del final");

const antesVacios = red.enviados.length;

campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.value = "      ";
campo.disparar("keydown", { key: "Enter", code: "Enter" });
campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.value = "";
campo.disparar("keydown", { key: "Enter", code: "Enter" });

comprobar(red.enviados.length === antesVacios, "no se envían mensajes vacíos");
comprobar(entrada.hidden === true, "el campo se cierra igualmente");

campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.value = "y".repeat(CONFIG.CHAT_LONGITUD_MAXIMA + 60);
campo.disparar("keydown", { key: "Enter", code: "Enter" });

comprobar(red.enviados[red.enviados.length - 1].length === CONFIG.CHAT_LONGITUD_MAXIMA,
    `un mensaje larguísimo se recorta a ${CONFIG.CHAT_LONGITUD_MAXIMA} caracteres antes de salir`);

red.responder = (texto, respuesta) => {
    if (respuesta) {
        respuesta({ ok: false, mensaje: "Vas demasiado rápido: espera un instante." });
    }
};

campo.disparar("keydown", { key: "T", code: "KeyT" });
campo.value = "otra vez";
campo.disparar("keydown", { key: "Enter", code: "Enter" });

comprobar(lista.children[0].classList.contains("sistema"),
    "si el servidor rechaza el mensaje, el chat lo avisa en pantalla");

red.responder = null;

const teclasAlVolver = juego.teclas;

superficieJuego.disparar("keydown", { key: "w", code: "KeyW" });

comprobar(juego.teclas === teclasAlVolver + 1,
    "al cerrar el chat los controles del juego vuelven a funcionar con normalidad");

console.log("");
console.log("== CHAT DURANTE LA PARTIDA Y FIN DE PARTIDA ==");

red.avisar("chat", deJugador(0, "quedan mensajes visibles"));

const visiblesAntes = visibles().length;

chat.bloquear();

comprobar(chat.bloqueado === true && entrada.hidden === true && chat.escribiendo === false,
    "al terminar la partida el chat deja de aceptar escritura");

campo.disparar("keydown", { key: "T", code: "KeyT" });

comprobar(chat.escribiendo === false, "T ya no abre el campo al terminar la partida");

red.avisar("chat", deJugador(1, "mensaje después del final"));

comprobar(visibles().length === visiblesAntes, "no entran mensajes nuevos después del final");

reloj.avanzar(api.CHAT_DURACION_MENSAJE);
reloj.avanzar(api.CHAT_DURACION_SALIDA);

comprobar(lista.children.length === 0,
    "los mensajes que estaban en pantalla se apagan solos (no se quedan sobre el resultado)");

chat.habilitar();

comprobar(chat.bloqueado === false, "en la revancha el chat vuelve a estar disponible");

sinError("limpiar el chat al cambiar de sala", () => chat.limpiar());

comprobar(lista.children.length === 0 && entrada.hidden === true,
    "al cambiar de sala el chat queda vacío y cerrado (sin historial de la sala anterior)");

console.log("");
console.log("== NO ROMPE EL JUEGO ==");

const fuenteRed = fs.readFileSync(path.join(RAIZ, "js", "red.js"), "utf8");
const codigoChat = fuenteChat.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

comprobar(/chat:mensaje/.test(fuenteRed) && /chat:enviar/.test(fuenteRed),
    "el chat viaja por la conexión Socket.IO que ya tiene el juego (js/red.js)");
comprobar(!/new WebSocket|socket\.io|fetch\(|\bio\(/.test(codigoChat),
    "js/chat.js no abre ninguna conexión nueva (ni otro servidor ni polling)");
comprobar(!/jugador:(entrada|disparar|cargar)|partida:(iniciar|reiniciar)|sala:(listo|personaje)/.test(codigoChat),
    "js/chat.js no envía ninguna acción de juego: solo mensajes de chat");
comprobar(!/\b(juego|partida|sala)\.(estado|jugadores|jugador|vida|turno|tiempoRestante|viento|miJugador|ancho|alto|disparar)/.test(codigoChat),
    "el código del chat no lee ni escribe el estado del juego (turnos, vida, viento, temporizador)");
comprobar(!/\b(disparar|cargar|saltar|caminar)\s*\(/.test(codigoChat),
    "el chat no llama a ninguna acción del pollito (mover, saltar, cargar, disparar)");

/* --- Resumen ----------------------------------------------------------- */

console.log("");

if (fallos.length > 0) {
    console.log(`FALLOS (${fallos.length}):`);
    fallos.forEach((fallo) => console.log(`  - ${fallo}`));
    process.exitCode = 1;
} else {
    console.log("Todo correcto: el chat flotante de combate funciona y no altera el juego.");
}

/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Prueba de dibujo sin navegador
 * =========================================================
 *
 * Carga los módulos de dibujo del cliente (recursos, personaje, terreno,
 * escenario, interfaz, explosión y partículas) dentro de Node con un lienzo
 * falso que solo APUNTA lo que se le pide, y dibuja un fotograma completo con
 * un mundo igual al que manda el servidor.
 *
 * Sirve para comprobar, sin abrir el navegador:
 *  - Que ningún método de dibujo lanza errores (un error de dibujo deja la
 *    pantalla congelada y es lo más difícil de ver a simple vista).
 *  - Que con los dibujos cargados se usan de verdad (drawImage) y que sin
 *    ellos se dibuja la versión vectorial de respaldo.
 *  - Que el HUD se pinta sin jugadores, con seis jugadores y con todos muertos.
 *
 * Uso:  npm run dibujo
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RAIZ = path.join(__dirname, "..");

/* --- Lienzo falso ------------------------------------------------------- */

/** Crea un contexto de dibujo que cuenta cada llamada. */
function crearLienzo() {
    const llamadas = new Map();
    const anotar = (nombre) => (...argumentos) => {
        llamadas.set(nombre, (llamadas.get(nombre) || 0) + 1);

        return undefined;
    };

    const lienzo = {
        canvas: { width: 1200, height: 600 },
        llamadas,
        createLinearGradient: () => ({ addColorStop: anotar("addColorStop") }),
        createRadialGradient: () => ({ addColorStop: anotar("addColorStop") }),
        createPattern: () => null,
        measureText: () => ({ width: 240 }),
        save: anotar("save"),
        restore: anotar("restore"),
        translate: anotar("translate"),
        scale: anotar("scale"),
        rotate: anotar("rotate"),
        transform: anotar("transform"),
        setTransform: anotar("setTransform"),
        resetTransform: anotar("resetTransform"),
        beginPath: anotar("beginPath"),
        closePath: anotar("closePath"),
        moveTo: anotar("moveTo"),
        lineTo: anotar("lineTo"),
        arc: anotar("arc"),
        ellipse: anotar("ellipse"),
        rect: anotar("rect"),
        roundRect: anotar("roundRect"),
        fill: anotar("fill"),
        stroke: anotar("stroke"),
        clip: anotar("clip"),
        fillRect: anotar("fillRect"),
        strokeRect: anotar("strokeRect"),
        clearRect: anotar("clearRect"),
        drawImage: anotar("drawImage"),
        fillText: anotar("fillText"),
        strokeText: anotar("strokeText"),
        setLineDash: anotar("setLineDash")
    };

    return lienzo;
}

/* --- Entorno mínimo del navegador --------------------------------------- */

/** Imagen falsa: permite simular que la carga terminó o que falló. */
class ImagenFalsa {
    constructor() {
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.eventos = {};
        this.src = "";
    }

    addEventListener(tipo, manejador) {
        this.eventos[tipo] = manejador;
    }

    /** Simula una imagen cargada de las medidas indicadas. */
    simularCarga(ancho = 72, alto = 96) {
        this.naturalWidth = ancho;
        this.naturalHeight = alto;

        if (this.eventos.load) {
            this.eventos.load();
        }
    }
}

const almacen = new Map();

function crearEntorno() {
    const ventana = {
        location: {
            protocol: "http:",
            hostname: "localhost",
            port: "5173",
            origin: "http://localhost:5173",
            search: "",
            reload: () => {}
        },
        localStorage: {
            getItem: (clave) => (almacen.has(clave) ? almacen.get(clave) : null),
            setItem: (clave, valor) => almacen.set(clave, String(valor)),
            removeItem: (clave) => almacen.delete(clave)
        },
        performance: { now: () => Date.now() },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        setTimeout: () => 0,
        Image: ImagenFalsa,
        addEventListener: () => {},
        removeEventListener: () => {},
        navigator: { clipboard: { writeText: async () => {} } },
        document: {
            getElementById: () => null,
            createElement: () => ({ style: {}, appendChild: () => {} }),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {}
        },
        console
    };

    ventana.window = ventana;
    ventana.globalThis = ventana;

    vm.createContext(ventana);

    return ventana;
}

/* --- Prueba ------------------------------------------------------------- */

/** Carga un archivo del cliente dentro del entorno (como un <script>). */
function cargar(ventana, relativa) {
    const fuente = fs.readFileSync(path.join(RAIZ, relativa), "utf8");

    vm.runInContext(fuente, ventana, { filename: relativa });
}

const ventana = crearEntorno();

[
    "js/configuracion/configuracion_sonido.js",
    "js/config.js",
    "js/recursos.js",
    "js/terreno.js",
    "js/escenario.js",
    "js/particulas.js",
    "js/explosion.js",
    "js/personaje.js",
    "js/interfaz.js"
].forEach((archivo) => cargar(ventana, archivo));

// Las clases (class) y constantes (const) de un script clásico NO son
// propiedades del objeto global, ni en el navegador ni aquí: viven en el
// ámbito léxico del documento, que los scripts comparten. Para poder usarlas
// desde Node se copian a mano en un puente dentro del propio entorno.
vm.runInContext(`
    globalThis.__api = {
        Terreno,
        Escenario,
        Particulas,
        Explosion,
        PersonajeVista,
        Interfaz,
        Recursos,
        OpcionesJuego,
        CONFIG_CLIENTE
    };
`, ventana, { filename: "puente" });

const api = ventana.__api;

if (!api || typeof api.Terreno !== "function") {
    console.error("No se pudieron cargar los módulos del cliente.");
    process.exit(1);
}

const CONFIG = require(path.join(RAIZ, "servidor", "config.js"));

/**
 * Igual que hace js/main.js al arrancar: pedir todos los dibujos de una vez.
 * Así la prueba recorre exactamente el mismo camino que el juego.
 */
const pedidos = api.Recursos.precargarTodo();
const mundo = {
    ancho: CONFIG.ANCHO,
    alto: CONFIG.ALTO,
    celda: CONFIG.CELDA,
    plataformas: CONFIG.PLATAFORMAS,
    escenario: CONFIG.ESCENARIO
};

const fallos = [];

/** Comprueba una condición y anota el fallo si no se cumple. */
function comprobar(condicion, descripcion) {
    console.log(`  ${condicion ? "OK   " : "FALLO"} ${descripcion}`);

    if (!condicion) {
        fallos.push(descripcion);
    }
}

/** Ejecuta una función anotando si lanza un error. */
function sinError(descripcion, funcion) {
    try {
        funcion();
        comprobar(true, descripcion);
    } catch (error) {
        comprobar(false, `${descripcion} -> ${error.message}`);
    }
}

/** Lista de las 36 claves de dibujo de los pollitos (6 personajes x 6 estados). */
function clavesDePollito() {
    const claves = [];
    const nombres = ["quieto", "caminar", "salto", "disparo", "danio", "muerto"];

    for (let indice = 0; indice < 6; indice++) {
        nombres.forEach((estado) => claves.push(api.Recursos.rutaPollito(indice, estado)));
    }

    return claves;
}

/** Crea un jugador de prueba como el que envía el servidor. */
function jugadorDePrueba(indice, x, opciones = {}) {
    return new api.PersonajeVista({
        id: `j${indice}`,
        nombre: `Pollito ${indice + 1}`,
        personaje: indice,
        x,
        y: 420,
        vida: opciones.vida === undefined ? 100 : opciones.vida,
        vivo: opciones.vivo !== false,
        direccion: indice % 2 === 0 ? 1 : -1,
        angulo: opciones.angulo === undefined ? 30 : opciones.angulo,
        potencia: 300,
        cargando: Boolean(opciones.cargando),
        animacion: opciones.animacion || "idle",
        enSuelo: opciones.enSuelo !== false,
        estadisticas: { disparos: 1, danioInfligido: 25, bajas: 1, muertes: 0 }
    }, CONFIG.PERSONAJES[indice]);
}

console.log("");
console.log("POLLITOS AL ATAQUE - Prueba de dibujo");

/* 1. Sin dibujos cargados: debe dibujarse la versión de respaldo. */

const lienzoVectorial = crearLienzo();
const terreno = new api.Terreno(mundo);
const escenario = new api.Escenario(mundo.ancho, mundo.alto);
const particulas = new api.Particulas(lienzoVectorial);
const anaIdeal = jugadorDePrueba(0, 200);
const estados = ["idle", "caminar", "salto", "disparo", "danio", "muerto"];

sinError("Cielo, terreno, decoración y mar se dibujan", () => {
    escenario.actualizar(0.16);
    escenario.dibujarCielo(lienzoVectorial);
    terreno.dibujar(lienzoVectorial);
    escenario.dibujarDecoracion(lienzoVectorial, mundo.plataformas, terreno);
    escenario.dibujarMar(lienzoVectorial);
});

sinError("Los seis estados del pollito (respaldo vectorial)", () => {
    estados.forEach((estado) => {
        anaIdeal.animacion = estado;
        anaIdeal.vivo = estado !== "muerto";
        anaIdeal.actualizar(0.05);
        anaIdeal.dibujar(lienzoVectorial, { esTurno: true, mostrarNombres: true });
    });
});

comprobar(
    pedidos.length >= 36,
    `Se piden los dibujos de los seis estados de los seis pollitos (${pedidos.length} en total)`
);

comprobar(
    clavesDePollito().every((clave) => api.Recursos.cache.has(clave)),
    "Los 36 dibujos de pollito (6 personajes x 6 estados) están pedidos"
);

comprobar(
    (lienzoVectorial.llamadas.get("drawImage") || 0) === 0,
    "Sin dibujos cargados no se llama a drawImage"
);

comprobar(
    (lienzoVectorial.llamadas.get("fill") || 0) > 20,
    "El respaldo vectorial pinta formas"
);

/* 2. Con los dibujos cargados: debe usarse el arte del juego. */

const lienzoArte = crearLienzo();
const pollitoArte = jugadorDePrueba(3, 320);
let imagenesPedidas = 0;

api.Recursos.cache.forEach((entrada) => {
    entrada.imagen.simularCarga(72, 96);
    imagenesPedidas += 1;
});

comprobar(
    imagenesPedidas >= 36,
    `Se cargan los dibujos pedidos (${imagenesPedidas} imágenes)`
);

sinError("Con arte cargado, el pollito se dibuja con drawImage", () => {
    estados.forEach((estado) => {
        pollitoArte.animacion = estado;
        pollitoArte.vivo = estado !== "muerto";
        pollitoArte.tiempoDisparo = estado === "disparo" ? 0.3 : 0;
        pollitoArte.tiempoDanio = estado === "danio" ? 0.4 : 0;
        pollitoArte.actualizar(0.05);
        pollitoArte.dibujar(lienzoArte, { esTurno: true, mostrarNombres: true });
    });
});

comprobar(
    (lienzoArte.llamadas.get("drawImage") || 0) >= 6,
    `El arte se usa de verdad (drawImage = ${lienzoArte.llamadas.get("drawImage") || 0})`
);

sinError("Cielo, plataformas lejanas y adornos con sus dibujos", () => {
    escenario.dibujarCielo(lienzoArte);
    escenario.dibujarDecoracion(lienzoArte, mundo.plataformas, terreno);
});

comprobar(
    (lienzoArte.llamadas.get("drawImage") || 0) > 8,
    "Las plataformas lejanas y los adornos usan sus dibujos"
);

/* 3. HUD en sus tres situaciones. */

function probarHud(descripcion, jugadores, opciones = {}) {
    const lienzo = crearLienzo();
    const primero = jugadores[0];
    const juegoFalso = {
        ancho: mundo.ancho,
        alto: mundo.alto,
        estado: { turno: primero ? primero.id : null, jugadores: [] },
        jugadores: new Map(jugadores.map((jugador) => [jugador.id, jugador])),
        tiempoRestante: opciones.tiempo === undefined ? 7 : opciones.tiempo,
        viento: opciones.viento === undefined ? -6 : opciones.viento,
        potenciaLocal: 420,
        anguloLocal: 47,
        avisoCentral: { texto: "¡TU TURNO!", subtexto: "Apúntate y dispara", color: "#ffd166", tiempo: 1, duracion: 1.6 },
        miJugador: () => primero || null
    };
    const interfaz = new api.Interfaz(juegoFalso);

    sinError(`HUD: ${descripcion}`, () => interfaz.dibujar(lienzo));

    return lienzo;
}

probarHud("sin jugadores", []);
probarHud("un jugador con el turno", [jugadorDePrueba(0, 150, { cargando: true })]);
probarHud(
    "seis jugadores, dos eliminados y tiempo agotándose",
    [0, 1, 2, 3, 4, 5].map((indice) => jugadorDePrueba(indice, 100 + indice * 180, {
        vivo: indice > 1,
        vida: indice > 1 ? 70 - indice * 8 : 0,
        animacion: indice === 1 ? "disparo" : "idle"
    })),
    { tiempo: 2 }
);

/* 4. Aviso de ayuda: se dibuja solo si está activado en OPCIONES. */

sinError("Ayuda de controles activada y desactivada", () => {
    const juegoFalso = { ancho: mundo.ancho, alto: mundo.alto, estado: null, jugadores: new Map(), miJugador: () => null, avisoCentral: { tiempo: 0 } };
    const interfaz = new api.Interfaz(juegoFalso);

    api.OpcionesJuego.establecer("mostrarAyuda", true);
    interfaz.dibujar(crearLienzo());
    api.OpcionesJuego.establecer("mostrarAyuda", false);
    interfaz.dibujar(crearLienzo());
});

/* 5. Efectos (explosión y partículas). */

sinError("Explosiones, chispas, humo y plumas", () => {
    const explosion = new api.Explosion(400, 300, 60, "#ffb347", 0.7);
    explosion.actualizar(0.2);
    explosion.dibujar(lienzoArte);
    particulas.chispasDisparo(200, 200);
    particulas.humoExplosion(300, 300);
    particulas.plumasMuerte(400, 400, "#ffd166");
    particulas.actualizar(0.1);
    particulas.dibujar();
});

/* --- Resumen ----------------------------------------------------------- */

console.log("");

if (fallos.length > 0) {
    console.log(`FALLOS (${fallos.length}):`);
    fallos.forEach((fallo) => console.log(`  - ${fallo}`));
    process.exitCode = 1;
} else {
    console.log("Todo correcto: el cliente dibuja sin errores.");
}

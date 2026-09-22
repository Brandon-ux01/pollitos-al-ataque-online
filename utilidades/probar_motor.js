/**
 * PRUEBA DEL MOTOR AUTORITATIVO (utilidad de desarrollo)
 *
 * Ejecuta el mismo código que usa el servidor (servidor/partida.js y
 * servidor/terreno.js) sin red, para comprobar que las mecánicas heredadas
 * siguen funcionando: colocación, física (incluido el DOBLE SALTO de los
 * pollos), turnos, disparo, daño, muerte, terreno destruible, desconexión y
 * final de partida.
 *
 * Uso:
 *   npm run motor
 *   node utilidades/probar_motor.js
 */

const CONFIG = require("../servidor/config");
const Terreno = require("../servidor/terreno");
const Partida = require("../servidor/partida");

const fallos = [];
let pruebas = 0;

function comprobar(condicion, descripcion) {
    pruebas += 1;

    if (condicion) {
        console.log(`  ok   ${descripcion}`);
    } else {
        fallos.push(descripcion);
        console.log(`  FALLA ${descripcion}`);
    }
}

function jugadoresSala(cantidad) {
    return Array.from({ length: cantidad }, (indice, posicion) => ({
        id: `s${posicion}`,
        nombre: `Jugador ${posicion + 1}`,
        personaje: posicion,
        indice: posicion
    }));
}

/**
 * Avanza la partida hasta que no queden proyectiles.
 */
function resolverProyectiles(partida, segundosMaximos = 12) {
    const paso = CONFIG.PASO_SIMULACION;
    let transcurrido = 0;

    while (partida.proyectiles.length && transcurrido < segundosMaximos) {
        partida.actualizar(paso);
        transcurrido += paso;
    }

    return transcurrido;
}

/**
 * Coloca a un jugador en una posición concreta y simula hasta que quede
 * apoyado sobre una superficie (usa la DETECCIÓN DE SUELO real del juego).
 *
 * @param {Partida} partida Partida de la prueba.
 * @param {string} id Identificador del jugador.
 * @param {number} x Posición horizontal de partida.
 * @param {number} y Posición vertical de partida.
 * @returns {object} Estado del jugador.
 */
function apoyarJugador(partida, id, x, y) {
    const jugador = partida.jugadores.get(id);

    jugador.x = x;
    jugador.y = y;
    jugador.vx = 0;
    jugador.vy = 0;
    jugador.enSuelo = false;
    jugador.saltosRealizados = 0;
    jugador.saltoMantenido = false;

    for (let paso = 0; paso < 300; paso++) {
        partida.actualizar(CONFIG.PASO_SIMULACION);

        if (jugador.enSuelo && jugador.vy === 0) {
            return jugador;
        }
    }

    return jugador;
}

/** Y de los pies del jugador (para ver sobre qué superficie está). */
function piesDe(jugador) {
    return jugador.y + CONFIG.RADIO_PERSONAJE;
}

console.log("\n== TERRENO DESTRUIBLE ==");
{
    const terreno = new Terreno();
    comprobar(terreno.esSolidoEn(100, 530), "hay terreno sólido en la base del mapa");
    comprobar(!terreno.esSolidoEn(600, 100), "el aire en alto no es sólido");
    comprobar(terreno.buscarSuperficie(100, 400, 2, 200) === 496, "la superficie de la primera plataforma está en y=496");
    comprobar(terreno.buscarSuperficie(1150, 100, 2, 400) === 144, "la plataforma más alta del mapa está en y=144");

    const excavado = terreno.excavar(100, 500, 40);
    comprobar(excavado, "excavar devuelve true cuando quita celdas");
    comprobar(!terreno.esSolidoEn(100, 500), "la celda excavada deja de ser sólida");
    comprobar(!terreno.excavar(100, 500, 40), "excavar dos veces el mismo punto no reporta cambios");
}

console.log("\n== COLOCACIÓN INICIAL ==");
{
    const partida = new Partida(jugadoresSala(6));
    const jugadores = partida.listaJugadores();

    comprobar(jugadores.length === 6, "se crean seis jugadores");
    comprobar(new Set(jugadores.map((j) => `${Math.round(j.x)}|${Math.round(j.y)}`)).size === 6,
        "los seis aparecen en posiciones distintas");

    let distanciaMinimaReal = Infinity;

    jugadores.forEach((a) => jugadores.forEach((b) => {
        if (a.id !== b.id) {
            distanciaMinimaReal = Math.min(distanciaMinimaReal, Math.hypot(a.x - b.x, a.y - b.y));
        }
    }));

    comprobar(distanciaMinimaReal >= 70, `la distancia mínima entre jugadores es ${distanciaMinimaReal.toFixed(1)} px`);

    for (let paso = 0; paso < 10; paso++) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
    }

    const todosApoyados = jugadores.every((jugador) => {
        const pies = jugador.y + CONFIG.RADIO_PERSONAJE;
        const superficie = partida.terreno.buscarSuperficie(jugador.x, pies, 3, 6);
        return superficie !== null && Math.abs(superficie - pies) <= 3;
    });

    comprobar(todosApoyados, "todos quedan apoyados sobre plataformas (ninguno en el agua)");
}

console.log("\n== TURNOS Y VALIDACIÓN DE ACCIONES ==");
{
    const partida = new Partida(jugadoresSala(3));

    comprobar(partida.turno === "s0", "el primer turno es del jugador 1");
    comprobar(partida.entrada("s1", { direccion: 1 }) === false, "un jugador sin turno no puede moverse");
    comprobar(partida.disparar("s1") === false, "un jugador sin turno no puede disparar");
    comprobar(partida.entrada("s0", { direccion: 1, angulo: 45 }) === true, "el jugador con turno puede moverse y apuntar");
    comprobar(partida.jugadores.get("s0").angulo === 45, "el ángulo se aplica");
    comprobar(partida.entrada("s0", { angulo: 300 }) === true && partida.jugadores.get("s0").angulo === CONFIG.ANGULO_MAXIMO,
        "el ángulo se limita a 80°");

    partida.avanzarTurno();
    comprobar(partida.turno === "s1", "avanzarTurno pasa al segundo jugador");
    comprobar(partida.jugadores.get("s0").angulo === CONFIG.ANGULO_MAXIMO, "cada jugador conserva su ángulo al perder el turno");
}

console.log("\n== FÍSICA, MOVIMIENTO Y SALTO ==");
{
    const partida = new Partida(jugadoresSala(2));
    const jugador = partida.jugadores.get("s0");

    // Posición fija y conocida sobre la primera plataforma (y=496) para que
    // la prueba no dependa de la colocación aleatoria.
    jugador.x = 60;
    jugador.y = 400;
    partida.jugadores.get("s1").x = 1100;
    partida.jugadores.get("s1").y = 100;

    for (let paso = 0; paso < 40; paso++) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
    }

    comprobar(jugador.enSuelo, "cae y queda apoyado sobre la plataforma");
    comprobar(Math.abs(jugador.y + CONFIG.RADIO_PERSONAJE - 496) < 0.01, "los pies quedan exactamente en la superficie (496)");

    const xInicial = jugador.x;

    partida.entrada("s0", { direccion: 1 });

    for (let paso = 0; paso < 15; paso++) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
    }

    comprobar(jugador.x > xInicial, "el jugador se desplaza a la derecha");
    comprobar(jugador.direccion === 1, "la dirección apunta a la derecha");

    partida.entrada("s0", { direccion: 0 });
    partida.actualizar(CONFIG.PASO_SIMULACION);
    comprobar(jugador.enSuelo && jugador.vx === 0, "al soltar la tecla el jugador queda quieto");

    partida.entrada("s0", { saltar: true });
    partida.actualizar(CONFIG.PASO_SIMULACION);

    comprobar(!jugador.enSuelo && jugador.vy < 0, "el salto aplica velocidad hacia arriba");

    for (let paso = 0; paso < 60; paso++) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
    }

    comprobar(jugador.enSuelo, "el jugador vuelve a caer y apoyarse");
    comprobar(jugador.vx === 0, "no se arrastra movimiento entre turnos");
}

console.log("\n== DOBLE SALTO (POLLOS) ==");
{
    const partida = new Partida(jugadoresSala(2));

    // El otro jugador se aparta para no estorbar la física.
    partida.jugadores.get("s1").x = 1100;
    partida.jugadores.get("s1").y = 100;

    /** El cronómetro es cosa de otra prueba: aquí se deja el turno lleno. */
    const sinCronometro = () => {
        partida.tiempoTurno = CONFIG.DURACION_TURNO;
    };

    // PRUEBA 1: en el suelo, ESPACIO hace el primer salto.
    const jugador = apoyarJugador(partida, "s0", 60, 400);

    comprobar(jugador.enSuelo && jugador.saltosRealizados === 0,
        "PRUEBA 1: el pollo está apoyado en el suelo (0 saltos gastados)");

    sinCronometro();
    partida.entrada("s0", { saltar: true });

    comprobar(jugador.vy === -CONFIG.FUERZA_SALTO && jugador.saltosRealizados === 1,
        `PRUEBA 1: ESPACIO da el primer salto con la fuerza de siempre (${CONFIG.FUERZA_SALTO} px/s)`);

    partida.actualizar(CONFIG.PASO_SIMULACION);

    comprobar(!jugador.enSuelo && jugador.vy < 0, "PRUEBA 1: el pollo está en el aire, subiendo");

    // PRUEBA 2: en el aire, ESPACIO otra vez hace el segundo salto.
    const vyAntes = jugador.vy;

    partida.entrada("s0", { saltar: false });
    partida.entrada("s0", { saltar: true });

    comprobar(jugador.vy === -CONFIG.FUERZA_SALTO && jugador.saltosRealizados === 2,
        "PRUEBA 2: ESPACIO en el aire da el SEGUNDO salto (misma fuerza)");
    comprobar(jugador.vy < vyAntes, "PRUEBA 2: el segundo salto vuelve a impulsarlo hacia arriba");

    // PRUEBA 3: un tercer ESPACIO no hace nada.
    const saltosRegistrados = partida.eventos.filter((evento) => evento.tipo === "salto").length;

    partida.entrada("s0", { saltar: false });
    partida.entrada("s0", { saltar: true });

    comprobar(jugador.saltosRealizados === 2 &&
        partida.eventos.filter((evento) => evento.tipo === "salto").length === saltosRegistrados,
        "PRUEBA 3: con los dos saltos gastados ESPACIO no hace nada (no hay tercer salto)");

    // PRUEBA 4: al aterrizar se recuperan los dos saltos.
    let pasos = 0;

    while (!jugador.enSuelo && pasos < 600) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
        pasos += 1;
    }

    comprobar(jugador.enSuelo && jugador.saltosRealizados === 0,
        `PRUEBA 4: al tocar el suelo el contador vuelve a 0 (aterrizó con los pies en y=${Math.round(piesDe(jugador))})`);

    sinCronometro();
    partida.entrada("s0", { saltar: false });
    partida.entrada("s0", { saltar: true });

    comprobar(jugador.saltosRealizados === 1 && jugador.vy === -CONFIG.FUERZA_SALTO,
        "PRUEBA 4: puede volver a dar el primer salto");

    partida.entrada("s0", { saltar: false });
    partida.entrada("s0", { saltar: true });

    comprobar(jugador.saltosRealizados === 2, "PRUEBA 4: y también el segundo (dos saltos por ciclo)");
}

console.log("\n== DOBLE SALTO: PLATAFORMAS, PULSACIÓN Y RESTRICCIÓN ==");
{
    // PRUEBA 5: el doble salto funciona igual desde una plataforma alta.
    const partida = new Partida(jugadoresSala(2));

    partida.jugadores.get("s1").x = 1100;
    partida.jugadores.get("s1").y = 100;

    const plataformaAlta = CONFIG.PLATAFORMAS.reduce((masAlta, plataforma) => {
        return plataforma.y < masAlta.y ? plataforma : masAlta;
    });

    const saltador = apoyarJugador(
        partida,
        "s0",
        plataformaAlta.x + plataformaAlta.ancho / 2,
        plataformaAlta.y - 60
    );

    comprobar(saltador.enSuelo && Math.abs(piesDe(saltador) - plataformaAlta.y) < 0.01,
        `PRUEBA 5: el pollo queda apoyado en la plataforma alta (y=${plataformaAlta.y})`);

    partida.tiempoTurno = CONFIG.DURACION_TURNO;
    partida.entrada("s0", { saltar: true });

    const fuerzaDelPrimero = saltador.vy;

    partida.entrada("s0", { saltar: false });
    partida.entrada("s0", { saltar: true });

    comprobar(fuerzaDelPrimero === -CONFIG.FUERZA_SALTO && saltador.saltosRealizados === 2,
        "PRUEBA 5: desde la plataforma alta también hay dos saltos");

    // PRUEBA 6: después del doble salto aterriza en OTRA superficie (otra
    // altura) y el juego detecta el aterrizaje con su sistema de suelo.
    partida.entrada("s0", { saltar: false });
    partida.entrada("s0", { direccion: -1 });

    let pasos = 0;

    while (!saltador.enSuelo && pasos < 900) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
        pasos += 1;
    }

    const superficie = piesDe(saltador);
    const esSuperficieValida = CONFIG.PLATAFORMAS.some((plataforma) => Math.abs(plataforma.y - superficie) < 0.01);

    comprobar(saltador.enSuelo && esSuperficieValida,
        `PRUEBA 6: el doble salto aterriza sobre una superficie válida (y=${Math.round(superficie)}, distinta de ${plataformaAlta.y})`);
    comprobar(saltador.saltosRealizados === 0, "PRUEBA 6: el aterrizaje se detecta y el pollo recupera sus dos saltos");

    // Regla del PULSAR: mantener ESPACIO pulsado no gasta el segundo salto.
    const mantener = new Partida(jugadoresSala(2));

    mantener.jugadores.get("s1").x = 1100;
    mantener.jugadores.get("s1").y = 100;

    const pulsado = apoyarJugador(mantener, "s0", 60, 400);

    mantener.tiempoTurno = CONFIG.DURACION_TURNO;

    for (let vez = 0; vez < 5; vez++) {
        mantener.entrada("s0", { saltar: true });
    }

    comprobar(pulsado.saltosRealizados === 1 && pulsado.vy === -CONFIG.FUERZA_SALTO,
        "mantener ESPACIO pulsado no gasta el segundo salto (se salta al PULSAR)");

    mantener.entrada("s0", { saltar: false });
    mantener.entrada("s0", { saltar: true });

    comprobar(pulsado.saltosRealizados === 2, "soltar y volver a pulsar sí da el segundo salto");

    // Restricción por personaje: solo los POLLOS tienen doble salto.
    const otros = new Partida(jugadoresSala(2));
    const gusano = otros.jugadores.get("s1");
    const pollo = otros.jugadores.get("s0");

    gusano.tipo = "gusano";
    gusano.enSuelo = true;
    gusano.saltosRealizados = 0;

    otros.saltar(gusano);
    otros.saltar(gusano);

    comprobar(gusano.saltosRealizados === 1,
        "un personaje que NO es pollo (gusano, enemigo...) no recibe el doble salto");
    comprobar(pollo.tipo === "pollo" && otros.saltosMaximosDe(pollo) === CONFIG.SALTOS_MAXIMOS,
        `los jugadores son POLLOS y su límite es de ${CONFIG.SALTOS_MAXIMOS} saltos`);
}

console.log("\n== DISPARO, EXPLOSIÓN Y CRÁTER ==");
{
    const partida = new Partida(jugadoresSala(2));
    const atacante = partida.jugadores.get("s0");

    // Posiciones y dirección fijas: así el proyectil sale siempre hacia la
    // derecha y cae sobre el terreno, y esta prueba no depende del azar de la
    // colocación inicial (antes podía disparar hacia el borde y salir del mapa).
    atacante.x = 60;
    atacante.y = 400;
    atacante.direccion = 1;
    partida.jugadores.get("s1").x = 1100;
    partida.jugadores.get("s1").y = 100;

    atacante.angulo = 45;
    atacante.potencia = CONFIG.POTENCIA_MAXIMA;

    comprobar(partida.disparar("s0"), "el jugador con turno dispara");
    comprobar(partida.proyectiles.length === 1, "el proyectil existe en el servidor");
    comprobar(atacante.disparoRealizado, "el disparo queda registrado");
    comprobar(partida.disparar("s0") === false, "no se puede disparar dos veces en el mismo turno");

    const crateresAntes = partida.crateres.length;
    const transcurrido = resolverProyectiles(partida);

    comprobar(partida.proyectiles.length === 0, `el proyectil se resuelve en ${transcurrido.toFixed(2)} s`);
    comprobar(partida.crateres.length > crateresAntes, "el impacto excava un cráter en el terreno");

    let pasos = 0;

    while (partida.turno === "s0" && pasos < 200) {
        partida.actualizar(CONFIG.PASO_SIMULACION);
        pasos += 1;
    }

    comprobar(partida.turno !== "s0", "el turno avanza solo tras resolverse el disparo");
    comprobar(partida.jugadores.get("s0").estadisticas.disparos === 1, "se contabiliza el disparo");

    // La carga del cañón aumenta la potencia y se reinicia al cerrar el turno.
    const partida2 = new Partida(jugadoresSala(2));
    const jugador = partida2.jugadores.get("s0");

    partida2.cargar("s0", true);

    for (let paso = 0; paso < 15; paso++) {
        partida2.actualizar(CONFIG.PASO_SIMULACION);
    }

    comprobar(jugador.potencia > CONFIG.POTENCIA_MINIMA, "mantener el clic carga el cañón");
    comprobar(jugador.potencia <= CONFIG.POTENCIA_MAXIMA, "la potencia nunca pasa del máximo");
}

console.log("\n== DAÑO, MUERTE Y ESTADÍSTICAS ==");
{
    const partida = new Partida(jugadoresSala(3));
    const victima = partida.jugadores.get("s1");
    const autor = partida.jugadores.get("s0");

    victima.vida = 30;
    partida.aplicarExplosion(victima.x, victima.y, CONFIG.RADIO_EXPLOSION_PERSONAJE, "#ff6b6b", "s0");

    comprobar(victima.vida === 0 && !victima.vivo, "un impacto directo elimina al jugador");
    comprobar(autor.estadisticas.bajas === 1, "el autor suma una baja");
    comprobar(autor.estadisticas.danioInfligido === 30, "el daño infligido se limita a la vida restante");
    comprobar(partida.eventos.some((evento) => evento.tipo === "muerte"), "se registra el evento de muerte");

    const partida2 = new Partida(jugadoresSala(2));
    const lejano = partida2.jugadores.get("s1");

    partida2.aplicarExplosion(lejano.x + 32, lejano.y, CONFIG.RADIO_EXPLOSION_PERSONAJE, "#ffb347", "s0");

    comprobar(lejano.vida > 0 && lejano.vida < CONFIG.VIDA_MAXIMA, "a media distancia el daño es parcial");

    const partida3 = new Partida(jugadoresSala(2));
    const ahogado = partida3.jugadores.get("s0");

    ahogado.x = 600;
    ahogado.y = 590;
    partida3.actualizar(CONFIG.PASO_SIMULACION);

    comprobar(!ahogado.vivo, "caer al agua mata al jugador");
}

console.log("\n== FIN DE PARTIDA ==");
{
    const partida = new Partida(jugadoresSala(3));

    partida.matar(partida.jugadores.get("s0"), null, "prueba");
    partida.matar(partida.jugadores.get("s2"), null, "prueba");
    partida.comprobarFinPartida();

    comprobar(partida.estado === "finalizado", "la partida termina al quedar un superviviente");
    comprobar(partida.ganador && partida.ganador.id === "s1", "el ganador es el único superviviente");
    comprobar(partida.turno === null, "no queda turno activo al terminar");
    comprobar(partida.eventos.some((evento) => evento.tipo === "fin-partida"), "se emite el evento de fin de partida");

    partida.reiniciar(jugadoresSala(3));

    comprobar(partida.estado === "jugando", "la revancha vuelve a poner la partida en juego");
    comprobar(partida.vivos().length === 3, "todos reviven en la revancha");
    comprobar(partida.crateres.length === 0, "el terreno se reconstruye en la revancha");
    comprobar(partida.numero === 2, "el número de partida aumenta");
}

console.log("\n== DESCONEXIÓN ==");
{
    const partida = new Partida(jugadoresSala(4));
    const conTurno = partida.turno;

    partida.quitarJugador(conTurno);
    const jugador = partida.jugadores.get(conTurno);

    comprobar(!jugador.conectado && !jugador.vivo, "el jugador desconectado sale del campo");
    comprobar(partida.turno !== conTurno && partida.turno !== null, "el turno pasa a otro jugador");
    comprobar(partida.estado === "jugando", "la partida continúa con los jugadores restantes");
    comprobar(partida.eventos.some((evento) => evento.tipo === "abandono"), "se registra el abandono");
    comprobar(partida.vivos().length === 3, "quedan tres jugadores vivos");

    ["s0", "s1", "s2", "s3"].forEach((id) => partida.quitarJugador(id));
    comprobar(partida.estado === "finalizado", "sin jugadores conectados la partida finaliza");
}

console.log("\n== PAQUETES DE ESTADO ==");
{
    const partida = new Partida(jugadoresSala(2));
    const inicial = partida.instantaneaInicial();

    comprobar(inicial.tipo === "inicio", "el paquete inicial se marca como inicio");
    comprobar(inicial.mundo && inicial.mundo.plataformas.length === CONFIG.PLATAFORMAS.length,
        "el paquete inicial incluye el mundo completo");
    comprobar(inicial.mundo.escenario === CONFIG.ESCENARIO,
        "el paquete inicial incluye el escenario (para la música por escenario)");
    comprobar(inicial.jugadores.length === 2, "el paquete inicial incluye a los jugadores");
    comprobar(Array.isArray(inicial.eventos) && inicial.eventos.length > 0, "el paquete inicial llega con eventos");

    const victima = partida.jugadores.get("s1");
    victima.vida = 10;
    partida.aplicarExplosion(victima.x, victima.y, 60, "#ffb347", "s0");
    partida.actualizar(CONFIG.PASO_SIMULACION);

    const estado = partida.instantanea();
    comprobar(estado.tipo === "estado", "el paquete periódico se marca como estado");
    comprobar(estado.crateres.length >= 1, "el paquete incluye los cráteres como delta");
    comprobar(estado.estado === "finalizado", "el paquete refleja el final de la partida");

    const siguiente = partida.instantanea();
    comprobar(siguiente.crateres.length === 0, "los cráteres no se repiten en el paquete siguiente");
    comprobar(siguiente.eventos.length === 0, "los eventos no se repiten en el paquete siguiente");
}

console.log("\n=========================================================");
console.log(`Pruebas ejecutadas: ${pruebas}   Fallos: ${fallos.length}`);
console.log("=========================================================");

if (fallos.length) {
    fallos.forEach((fallo) => console.log(` - ${fallo}`));
    process.exitCode = 1;
}



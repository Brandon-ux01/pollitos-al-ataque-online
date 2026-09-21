/**
 * Clase Turnos
 *
 * Gestiona el orden de los personajes vivos para cada turno.
 *
 * Reglas importantes:
 *
 * - Un personaje muerto nunca recibe turno: se salta y se pasa al
 *   siguiente personaje vivo del orden intercalado.
 * - El cronómetro de 10 segundos SOLO cierra el turno actual. Nunca
 *   termina la partida. La victoria o la derrota se deciden únicamente
 *   en Juego.comprobarFinPartida(), cuando un equipo entero ha sido
 *   eliminado.
 */
class Turnos {
    constructor(juego) {
        this.juego = juego;
        this.ordenBase = this.crearOrdenIntercalado();
        this.orden = [];
        this.indiceActual = 0;
        this.tiempoRestante = 10;
    }

    /**
     * Construye una única secuencia intercalada.
     *
     * El índice siempre apunta a esta lista fija. De esta forma,
     * eliminar personajes muertos no cambia la posición relativa
     * de los personajes que continúan vivos.
     *
     * @returns {Array} Personajes en orden jugador, computadora.
     */
    crearOrdenIntercalado() {
        const orden = [];
        const cantidadMaxima = Math.max(
            this.juego.pollos.length,
            this.juego.gusanos.length
        );

        for (let indice = 0; indice < cantidadMaxima; indice++) {
            if (this.juego.pollos[indice]) {
                orden.push(this.juego.pollos[indice]);
            }

            if (this.juego.gusanos[indice]) {
                orden.push(this.juego.gusanos[indice]);
            }
        }

        return orden;
    }

    /**
     * Busca la siguiente posición viva desde un punto concreto.
     *
     * @param {number} posicionInicial Posición desde la que se busca.
     * @param {boolean} incluirInicio Indica si se revisa la posición inicial.
     * @returns {number} Índice encontrado o -1 si no quedan personajes.
     */
    buscarSiguienteVivo(posicionInicial, incluirInicio = true) {
        if (!this.ordenBase.length) {
            return -1;
        }

        const desplazamientoInicial = incluirInicio ? 0 : 1;

        for (let desplazamiento = desplazamientoInicial; desplazamiento < this.ordenBase.length + desplazamientoInicial; desplazamiento++) {
            const indice = (posicionInicial + desplazamiento) % this.ordenBase.length;
            const personaje = this.ordenBase[indice];

            if (personaje && personaje.vivo && personaje.vida > 0) {
                return indice;
            }
        }

        return -1;
    }

    /**
     * Actualiza la lista auxiliar de personajes vivos sin alterar
     * la secuencia intercalada original.
     */
    reconstruirOrden() {
        this.orden = this.ordenBase.filter(
            (personaje) => personaje && personaje.vivo && personaje.vida > 0
        );
    }

    /**
     * Devuelve el personaje vivo del turno actual.
     *
     * Si el personaje asignado murió, devuelve null para que el motor
     * marque el turno como finalizado y avanzar() busque al siguiente
     * personaje vivo. Nunca decide el final de la partida.
     *
     * @returns {object|null} Personaje activo o null.
     */
    getActual() {
        this.reconstruirOrden();

        if (!this.orden.length) {
            return null;
        }

        const actual = this.ordenBase[this.indiceActual];
        if (!actual || !actual.vivo || actual.vida <= 0) {
            return null;
        }

        return actual;
    }

    /**
     * Inicia el turno y reinicia su temporizador.
     *
     * Solo se entrega el turno a un personaje vivo. Al comenzar el turno
     * se limpia la velocidad de todos los personajes para que nadie
     * arrastre el movimiento de la acción anterior.
     */
    iniciarTurnoActual() {
        const actual = this.getActual();
        if (!actual) {
            return;
        }

        // Ningún personaje conserva movimiento entre turnos.
        this.juego.pollos.forEach((pollo) => pollo.detener());
        this.juego.gusanos.forEach((gusano) => gusano.detener());

        this.juego.personajeActivo = actual;
        this.tiempoRestante = 10;
        this.juego.turnoFinalizado = false;
        actual.disparoRealizado = false;

        if (actual.esJugador) {
            actual.canon.cargando = false;
            actual.canon.potencia = actual.canon.potenciaMinima;
        } else {
            this.juego.ia.iniciar(actual);
        }
    }

    /**
     * Avanza al siguiente personaje vivo de la lista intercalada.
     *
     * Los personajes muertos se omiten. La muerte de un personaje nunca
     * termina la partida: solo cambia a quién le toca el turno.
     */
    avanzar() {
        this.reconstruirOrden();
        if (!this.orden.length) {
            return;
        }

        const siguiente = this.buscarSiguienteVivo(this.indiceActual, false);
        if (siguiente === -1) {
            return;
        }

        this.indiceActual = siguiente;
        this.iniciarTurnoActual();
    }

    /**
     * Actualiza el temporizador del turno actual.
     *
     * Cuando el cronómetro llega a 0 se cierra el turno actual y el motor
     * busca al siguiente personaje vivo. Es la única consecuencia del
     * cronómetro: NUNCA comprueba ni decide el final de la partida.
     *
     * @param {number} delta Tiempo transcurrido en segundos.
     */
    actualizar(delta) {
        if (this.juego.resultado || this.juego.enPausa || this.juego.turnoFinalizado) {
            return;
        }

        const actual = this.getActual();

        // El personaje asignado murió: se cierra el turno y avanzar()
        // pasa al siguiente personaje vivo.
        if (!actual || !actual.vivo || actual.vida <= 0) {
            this.juego.turnoFinalizado = true;
            return;
        }

        this.tiempoRestante -= delta;

        if (this.tiempoRestante <= 0) {
            this.tiempoRestante = 0;
            this.juego.turnoFinalizado = true;
            actual.detener();
        }
    }

    /**
     * Congela el cronómetro y el turno en curso.
     *
     * Se utiliza únicamente cuando Juego.finalizarPartida() confirmó que
     * un equipo completo fue eliminado.
     */
    detener() {
        this.tiempoRestante = 0;
        this.juego.turnoFinalizado = true;

        const actual = this.ordenBase[this.indiceActual];
        if (actual && actual.detener) {
            actual.detener();
        }
    }
}


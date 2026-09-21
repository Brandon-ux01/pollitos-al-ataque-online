/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Interfaz sobre el canvas (HUD)
 * =========================================================
 *
 * Todo lo que se dibuja aquí son DATOS DEL SERVIDOR:
 *  - Turno actual y cronómetro (10 s) que solo cierra el turno.
 *  - Viento (afecta a los proyectiles) con dirección e intensidad.
 *  - Lista de los seis jugadores con su vida y sus bajas.
 *  - Potencia y ángulo del jugador local.
 *
 * El HUD se dibuja en coordenadas del canvas (1200x600), así que escala con
 * la ventana exactamente igual que el juego.
 */

class Interfaz {
    /**
     * @param {Juego} juego Instancia del juego del cliente.
     */
    constructor(juego) {
        this.juego = juego;
        this.fuente = "'Trebuchet MS', Verdana, sans-serif";
    }

    /**
     * Dibuja el HUD completo.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujar(ctx) {
        ctx.save();

        this.dibujarTarjetaTurno(ctx);
        this.dibujarViento(ctx);
        this.dibujarListaJugadores(ctx);
        this.dibujarControlesPropios(ctx);
        this.dibujarAvisoCentral(ctx);

        if (OpcionesJuego.valores.mostrarAyuda) {
            this.dibujarAyuda(ctx);
        }

        ctx.restore();
    }

    /**
     * Dibuja un panel translúcido con esquinas y borde.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto.
     * @param {number} x Posición horizontal.
     * @param {number} y Posición vertical.
     * @param {number} ancho Ancho.
     * @param {number} alto Alto.
     * @param {string} bordeColor Color del borde.
     */
    panel(ctx, x, y, ancho, alto, bordeColor = "rgba(98, 230, 255, 0.35)") {
        ctx.save();
        ctx.fillStyle = "rgba(4, 16, 28, 0.72)";
        ctx.strokeStyle = bordeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, ancho, alto, 12);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Tarjeta superior izquierda: turno, cronómetro y número de turno.
     */
    dibujarTarjetaTurno(ctx) {
        const estado = this.juego.estado;

        if (!estado) {
            return;
        }

        const actual = this.juego.jugadores.get(estado.turno);
        const tiempo = this.juego.tiempoRestante;
        const esMio = Boolean(actual) && actual.esLocal;
        const urgente = tiempo <= 3;
        const nombre = actual ? actual.nombre : "Partida terminada";

        this.panel(ctx, 16, 16, 300, 104, esMio ? "rgba(255, 209, 102, 0.8)" : undefined);

        ctx.save();
        ctx.font = `bold 13px ${this.fuente}`;
        ctx.fillStyle = "#9fc4de";
        ctx.fillText("TURNO DE", 32, 42);

        // Punto de color del jugador con el turno.
        if (actual) {
            ctx.fillStyle = actual.paleta.cuerpo;
            ctx.beginPath();
            ctx.arc(38, 62, 7, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.font = `bold 22px ${this.fuente}`;
        ctx.fillStyle = esMio ? "#ffd166" : "#ffffff";
        const etiqueta = `${esMio ? "🐔 " : ""}${nombre}`;
        ctx.fillText(etiqueta.length > 18 ? `${etiqueta.slice(0, 17)}…` : etiqueta, 52, 70);

        // Cronómetro grande.
        ctx.font = `bold 34px ${this.fuente}`;
        ctx.fillStyle = urgente ? "#ff6b6b" : "#a8ff72";
        ctx.textAlign = "right";
        ctx.fillText(String(tiempo ?? 0), 296, 62);
        ctx.textAlign = "left";

        // Barra de tiempo.
        const proporcion = Math.max(0, Math.min(1, (tiempo ?? 0) / 10));
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(32, 96, 248, 8);
        ctx.fillStyle = urgente ? "#ff6b6b" : "#62e6ff";
        ctx.fillRect(32, 96, 248 * proporcion, 8);

        ctx.font = `11px ${this.fuente}`;
        ctx.fillStyle = "#9fc4de";
        ctx.fillText(`TIEMPO: ${tiempo ?? 0} s`, 32, 116 + 0);

        ctx.restore();
    }

    /**
     * Indicador de viento (afecta a la trayectoria del proyectil).
     */
    dibujarViento(ctx) {
        const viento = this.juego.viento;
        const centroX = this.juego.ancho / 2;

        this.panel(ctx, centroX - 110, 16, 220, 54, "rgba(168, 255, 114, 0.35)");

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = `bold 13px ${this.fuente}`;
        ctx.fillStyle = "#9fc4de";
        ctx.fillText("VIENTO", centroX, 38);

        const fuerza = Math.min(1, Math.abs(viento) / 20);
        const flecha = viento >= 0 ? "▶" : "◀";
        ctx.font = `bold 16px ${this.fuente}`;
        ctx.fillStyle = "#a8ff72";
        ctx.fillText(`${flecha} ${Math.abs(viento).toFixed(1)}`, centroX, 60);

        // Barra central simétrica.
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(centroX - 90, 66, 180, 5);
        ctx.fillStyle = "#a8ff72";
        if (viento >= 0) {
            ctx.fillRect(centroX, 66, 90 * fuerza, 5);
        } else {
            ctx.fillRect(centroX - 90 * fuerza, 66, 90 * fuerza, 5);
        }

        ctx.restore();
    }

    /**
     * Lista de los seis jugadores con su vida y sus bajas.
     */
    dibujarListaJugadores(ctx) {
        const estado = this.juego.estado;

        if (!estado) {
            return;
        }

        const ancho = 226;
        const altoFila = 26;
        const x = this.juego.ancho - ancho - 16;
        const y = 16;
        const jugadores = [...this.juego.jugadores.values()].sort((a, b) => a.indice - b.indice);

        this.panel(ctx, x, y, ancho, 34 + jugadores.length * altoFila);

        ctx.save();
        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#9fc4de";
        ctx.fillText("JUGADORES", x + 14, y + 22);

        jugadores.forEach((jugador, posicion) => {
            const filaY = y + 40 + posicion * altoFila;
            const esTurno = estado.turno === jugador.id;
            const porcentaje = Math.max(0, Math.min(1, jugador.vida / 100));

            // Fondo de la fila del turno actual.
            if (esTurno) {
                ctx.fillStyle = "rgba(255, 209, 102, 0.16)";
                ctx.beginPath();
                ctx.roundRect(x + 8, filaY - 14, ancho - 16, altoFila - 4, 6);
                ctx.fill();
            }

            // Punto de color del personaje.
            ctx.fillStyle = jugador.vivo ? jugador.paleta.cuerpo : "#5b666f";
            ctx.beginPath();
            ctx.arc(x + 18, filaY - 4, 5, 0, Math.PI * 2);
            ctx.fill();

            // Nombre.
            ctx.font = jugador.esLocal ? `bold 12px ${this.fuente}` : `12px ${this.fuente}`;
            ctx.fillStyle = jugador.vivo ? (esTurno ? "#ffd166" : "#eaf6ff") : "#8b98a4";
            const nombre = `${jugador.esLocal ? "TU " : ""}${jugador.nombre}`;
            ctx.fillText(nombre.length > 13 ? `${nombre.slice(0, 12)}…` : nombre, x + 30, filaY - 7);

            // Bajas.
            if (jugador.estadisticas.bajas > 0) {
                ctx.textAlign = "right";
                ctx.font = `bold 11px ${this.fuente}`;
                ctx.fillStyle = "#ffb347";
                ctx.fillText(`☠ ${jugador.estadisticas.bajas}`, x + ancho - 14, filaY - 7);
                ctx.textAlign = "left";
            }

            // Barra de vida.
            ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
            ctx.fillRect(x + 30, filaY - 2, ancho - 46, 5);
            ctx.fillStyle = porcentaje > 0.6 ? "#4ddf7d" : porcentaje > 0.3 ? "#ffd166" : "#ff6b6b";
            ctx.fillRect(x + 30, filaY - 2, (ancho - 46) * porcentaje, 5);
        });

        ctx.restore();
    }

    /**
     * Potencia, ángulo y dirección del jugador local.
     */
    dibujarControlesPropios(ctx) {
        const mio = this.juego.miJugador();

        if (!mio) {
            return;
        }

        const x = 16;
        const y = this.juego.alto - 94;
        const esTurno = this.juego.estado && this.juego.estado.turno === mio.id;

        this.panel(ctx, x, y, 300, 78, esTurno ? "rgba(255, 209, 102, 0.7)" : undefined);

        ctx.save();
        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#9fc4de";
        ctx.fillText("POTENCIA", x + 16, y + 24);
        ctx.fillText("ÁNGULO", x + 196, y + 24);

        // Barra de potencia.
        const rango = CONFIG_CLIENTE.POTENCIA_MAXIMA - CONFIG_CLIENTE.POTENCIA_MINIMA;
        const potencia = this.juego.potenciaLocal;
        const proporcion = Math.max(0, Math.min(1, (potencia - CONFIG_CLIENTE.POTENCIA_MINIMA) / rango));

        ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
        ctx.fillRect(x + 16, y + 32, 160, 14);

        const gradiente = ctx.createLinearGradient(x + 16, 0, x + 176, 0);
        gradiente.addColorStop(0, "#a8ff72");
        gradiente.addColorStop(0.6, "#ffd166");
        gradiente.addColorStop(1, "#ff6b6b");
        ctx.fillStyle = gradiente;
        ctx.fillRect(x + 16, y + 32, 160 * proporcion, 14);

        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${Math.round(potencia)}`, x + 16, y + 62);

        // Ángulo y dirección.
        ctx.font = `bold 24px ${this.fuente}`;
        ctx.fillStyle = "#62e6ff";
        ctx.fillText(`${Math.round(this.juego.anguloLocal)}°`, x + 196, y + 50);

        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#9fc4de";
        ctx.fillText(mio.direccion < 0 ? "◀ izquierda" : "derecha ▶", x + 196, y + 68);

        ctx.restore();
    }

    /**
     * Aviso grande y temporal en el centro ("TU TURNO").
     */
    dibujarAvisoCentral(ctx) {
        if (this.juego.avisoCentral.tiempo <= 0) {
            return;
        }

        const aviso = this.juego.avisoCentral;
        const progreso = 1 - aviso.tiempo / aviso.duracion;
        const escala = 1 + Math.sin(Math.min(1, progreso * 2.2) * Math.PI) * 0.12;

        ctx.save();
        ctx.globalAlpha = Math.min(1, aviso.tiempo * 2);
        ctx.translate(this.juego.ancho / 2, 150);
        ctx.scale(escala, escala);
        ctx.textAlign = "center";
        ctx.font = `bold 40px ${this.fuente}`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(4, 16, 28, 0.9)";
        ctx.strokeText(aviso.texto, 0, 0);
        ctx.fillStyle = aviso.color;
        ctx.fillText(aviso.texto, 0, 0);

        if (aviso.subtexto) {
            ctx.font = `bold 16px ${this.fuente}`;
            ctx.strokeText(aviso.subtexto, 0, 28);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(aviso.subtexto, 0, 28);
        }

        ctx.restore();
    }

    /**
     * Ayuda de controles (se puede ocultar en OPCIONES).
     */
    dibujarAyuda(ctx) {
        const x = this.juego.ancho / 2;
        const y = this.juego.alto - 22;

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = `12px ${this.fuente}`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(4, 16, 28, 0.85)";
        const texto = "A / D o ← → mover · W / S o ↑ ↓ apuntar · ESPACIO saltar · CLIC mantener y soltar para disparar";
        ctx.strokeText(texto, x, y);
        ctx.fillStyle = "#cfe6f5";
        ctx.fillText(texto, x, y);
        ctx.restore();
    }
}



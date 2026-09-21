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
     * Dibuja un panel con el estilo del arte del juego: azul oscuro con
     * degradado, contorno claro y sombra dura (como una pegatina).
     *
     * @param {CanvasRenderingContext2D} ctx Contexto.
     * @param {number} x Posición horizontal.
     * @param {number} y Posición vertical.
     * @param {number} ancho Ancho.
     * @param {number} alto Alto.
     * @param {string} colorBorde Color del borde.
     */
    panel(ctx, x, y, ancho, alto, colorBorde = "rgba(120, 210, 255, 0.8)") {
        ctx.save();

        // Sombra dura.
        ctx.fillStyle = "rgba(8, 20, 35, 0.35)";
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 5, ancho, alto, 14);
        ctx.fill();

        // Cuerpo del panel.
        const relleno = ctx.createLinearGradient(0, y, 0, y + alto);
        relleno.addColorStop(0, "rgba(28, 78, 120, 0.94)");
        relleno.addColorStop(1, "rgba(12, 38, 62, 0.94)");
        ctx.beginPath();
        ctx.roundRect(x, y, ancho, alto, 14);
        ctx.fillStyle = relleno;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = colorBorde;
        ctx.stroke();

        // Brillo interior del borde.
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, ancho - 8, alto - 8, 10);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Banda oscura para el título de un panel.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto.
     * @param {number} x Posición horizontal.
     * @param {number} y Posición vertical.
     * @param {number} ancho Ancho.
     * @param {number} alto Alto.
     */
    banda(ctx, x, y, ancho, alto) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, ancho, alto, 8);
        ctx.fillStyle = "rgba(8, 26, 44, 0.7)";
        ctx.fill();
        ctx.restore();
    }

    /**
     * Tarjeta superior izquierda: de quién es el turno, su dibujo y el tiempo.
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

        this.panel(ctx, 16, 16, 306, 112, esMio ? "rgba(255, 209, 102, 0.95)" : undefined);

        ctx.save();

        // Banda del título: avisa cuando el turno es tuyo.
        this.banda(ctx, 26, 26, 286, 22);
        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = esMio ? "#ffd166" : "#9fe6ff";
        ctx.fillText(esMio ? "¡ES TU TURNO!" : "TURNO DE", 36, 42);

        // Ficha con el dibujo del jugador.
        if (actual) {
            Recursos.dibujarFicha(ctx, actual.indicePersonaje, 34, 56, 46, {
                vivo: true,
                borde: esMio ? "rgba(255, 209, 102, 0.95)" : "rgba(120, 210, 255, 0.85)"
            });
        }

        // Nombre con contorno.
        ctx.font = `bold 21px ${this.fuente}`;
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(8, 20, 35, 0.85)";
        const etiqueta = nombre.length > 14 ? `${nombre.slice(0, 13)}…` : nombre;
        ctx.strokeText(etiqueta, 90, 78);
        ctx.fillStyle = esMio ? "#ffd166" : "#ffffff";
        ctx.fillText(etiqueta, 90, 78);

        // Cronómetro grande.
        ctx.textAlign = "right";
        ctx.font = `bold 32px ${this.fuente}`;
        ctx.lineWidth = 5;
        ctx.strokeText(String(tiempo ?? 0), 308, 86);
        ctx.fillStyle = urgente ? "#ff8a8a" : "#a8ff72";
        ctx.fillText(String(tiempo ?? 0), 308, 86);
        ctx.textAlign = "left";

        // Barra de tiempo.
        const proporcion = Math.max(0, Math.min(1, (tiempo ?? 0) / 10));

        ctx.beginPath();
        ctx.roundRect(90, 106, 222, 10, 5);
        ctx.fillStyle = "rgba(6, 18, 30, 0.85)";
        ctx.fill();

        if (proporcion > 0.02) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(92, 108, 218 * proporcion, 6, 3);
            ctx.clip();
            ctx.fillStyle = urgente ? "#ff6b6b" : "#62e6ff";
            ctx.fillRect(92, 108, 218, 6);
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            ctx.fillRect(92, 108, 218, 2);
            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * Indicador de viento (afecta a la trayectoria del proyectil).
     */
    dibujarViento(ctx) {
        const viento = this.juego.viento;
        const centroX = this.juego.ancho / 2;
        const fuerza = Math.min(1, Math.abs(viento) / 20);
        const flecha = viento >= 0 ? "▶" : "◀";

        this.panel(ctx, centroX - 108, 16, 216, 64, "rgba(168, 255, 114, 0.6)");

        ctx.save();
        ctx.textAlign = "center";
        this.banda(ctx, centroX - 98, 24, 196, 18);
        ctx.font = `bold 11px ${this.fuente}`;
        ctx.fillStyle = "#cfe6f5";
        ctx.fillText("VIENTO", centroX, 37);

        ctx.font = `bold 20px ${this.fuente}`;
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(8, 20, 35, 0.85)";
        ctx.strokeText(`${flecha} ${Math.abs(viento).toFixed(1)}`, centroX, 62);
        ctx.fillStyle = "#a8ff72";
        ctx.fillText(`${flecha} ${Math.abs(viento).toFixed(1)}`, centroX, 62);

        // Barra central simétrica.
        ctx.beginPath();
        ctx.roundRect(centroX - 88, 68, 176, 7, 3.5);
        ctx.fillStyle = "rgba(6, 18, 30, 0.85)";
        ctx.fill();
        ctx.fillStyle = "#a8ff72";

        if (viento >= 0) {
            ctx.fillRect(centroX, 69.5, 86 * fuerza, 4);
        } else {
            ctx.fillRect(centroX - 86 * fuerza, 69.5, 86 * fuerza, 4);
        }

        ctx.restore();
    }

    /**
     * Lista de los seis jugadores con su dibujo, su vida y sus bajas.
     */
    dibujarListaJugadores(ctx) {
        const estado = this.juego.estado;

        if (!estado) {
            return;
        }

        const ancho = 248;
        const altoFila = 31;
        const x = this.juego.ancho - ancho - 16;
        const y = 16;
        const jugadores = [...this.juego.jugadores.values()].sort((a, b) => a.indicePersonaje - b.indicePersonaje);
        const alto = 42 + jugadores.length * altoFila;

        this.panel(ctx, x, y, ancho, alto);

        ctx.save();

        // Banda del título.
        this.banda(ctx, x + 10, y + 8, ancho - 20, 22);
        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#9fe6ff";
        ctx.fillText("JUGADORES", x + 20, y + 24);

        jugadores.forEach((jugador, posicion) => {
            const filaY = y + 46 + posicion * altoFila;
            const esTurno = estado.turno === jugador.id;
            const porcentaje = Math.max(0, Math.min(1, jugador.vida / 100));

            // Fila del turno actual resaltada.
            if (esTurno) {
                ctx.beginPath();
                ctx.roundRect(x + 8, filaY - 8, ancho - 16, altoFila - 3, 8);
                ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "rgba(255, 209, 102, 0.55)";
                ctx.stroke();
            }

            // Ficha con el dibujo del personaje.
            Recursos.dibujarFicha(ctx, jugador.indicePersonaje, x + 14, filaY - 4, 26, {
                vivo: jugador.vivo,
                borde: esTurno ? "rgba(255, 209, 102, 0.95)" : undefined
            });

            // Nombre.
            ctx.font = jugador.esLocal ? `bold 12px ${this.fuente}` : `12px ${this.fuente}`;
            ctx.fillStyle = jugador.vivo ? (esTurno ? "#ffd166" : "#eaf6ff") : "#8b98a4";
            const nombre = `${jugador.esLocal ? "TÚ · " : ""}${jugador.nombre}`;
            ctx.fillText(nombre.length > 14 ? `${nombre.slice(0, 13)}…` : nombre, x + 48, filaY + 6);

            // Bajas.
            if (jugador.estadisticas.bajas > 0) {
                ctx.textAlign = "right";
                ctx.font = `bold 11px ${this.fuente}`;
                ctx.fillStyle = "#ffb347";
                ctx.fillText(`☠ ${jugador.estadisticas.bajas}`, x + ancho - 14, filaY + 6);
                ctx.textAlign = "left";
            }

            // Barra de vida (fondo oscuro + relleno + brillo).
            ctx.beginPath();
            ctx.roundRect(x + 48, filaY + 11, ancho - 62, 8, 4);
            ctx.fillStyle = "rgba(6, 18, 30, 0.85)";
            ctx.fill();

            if (porcentaje > 0.02) {
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x + 49.5, filaY + 12.5, (ancho - 65) * porcentaje, 5, 2.5);
                ctx.clip();
                ctx.fillStyle = porcentaje > 0.6 ? "#5ce07a" : porcentaje > 0.3 ? "#ffd166" : "#ff6b6b";
                ctx.fillRect(x + 48, filaY + 11, ancho - 62, 8);
                ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                ctx.fillRect(x + 48, filaY + 11, ancho - 62, 2.5);
                ctx.restore();
            }
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
        const y = this.juego.alto - 96;
        const esTurno = this.juego.estado && this.juego.estado.turno === mio.id;

        this.panel(ctx, x, y, 306, 80, esTurno ? "rgba(255, 209, 102, 0.85)" : undefined);

        ctx.save();

        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#9fe6ff";
        ctx.fillText("POTENCIA", x + 16, y + 22);
        ctx.fillText("ÁNGULO", x + 196, y + 22);

        // Barra de potencia (con borde oscuro y degradado).
        const rango = CONFIG_CLIENTE.POTENCIA_MAXIMA - CONFIG_CLIENTE.POTENCIA_MINIMA;
        const potencia = this.juego.potenciaLocal;
        const proporcion = Math.max(0, Math.min(1, (potencia - CONFIG_CLIENTE.POTENCIA_MINIMA) / rango));

        ctx.beginPath();
        ctx.roundRect(x + 16, y + 30, 160, 16, 8);
        ctx.fillStyle = "rgba(6, 18, 30, 0.85)";
        ctx.fill();

        if (proporcion > 0.02) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x + 18, y + 32, 156 * proporcion, 12, 6);
            ctx.clip();
            const gradiente = ctx.createLinearGradient(x + 16, 0, x + 176, 0);
            gradiente.addColorStop(0, "#a8ff72");
            gradiente.addColorStop(0.6, "#ffd166");
            gradiente.addColorStop(1, "#ff6b6b");
            ctx.fillStyle = gradiente;
            ctx.fillRect(x + 16, y + 30, 160, 16);
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.fillRect(x + 16, y + 30, 160, 3);
            ctx.restore();
        }

        ctx.font = `bold 13px ${this.fuente}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${Math.round(potencia)}`, x + 16, y + 64);

        // Ángulo y dirección.
        ctx.font = `bold 26px ${this.fuente}`;
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(8, 20, 35, 0.85)";
        ctx.strokeText(`${Math.round(this.juego.anguloLocal)}°`, x + 196, y + 52);
        ctx.fillStyle = "#62e6ff";
        ctx.fillText(`${Math.round(this.juego.anguloLocal)}°`, x + 196, y + 52);

        ctx.font = `bold 12px ${this.fuente}`;
        ctx.fillStyle = "#cfe6f5";
        ctx.fillText(mio.direccion < 0 ? "◀ izquierda" : "derecha ▶", x + 196, y + 70);

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
        const y = this.juego.alto - 14;
        const texto = "A / D o ← → mover · W / S o ↑ ↓ apuntar · ESPACIO saltar · CLIC mantener y soltar para disparar";

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = `12px ${this.fuente}`;

        const anchoTexto = ctx.measureText(texto).width;

        // Banda oscura para que el texto se lea sobre cualquier fondo.
        ctx.beginPath();
        ctx.roundRect(x - anchoTexto / 2 - 18, y - 18, anchoTexto + 36, 24, 12);
        ctx.fillStyle = "rgba(8, 20, 35, 0.6)";
        ctx.fill();

        ctx.fillStyle = "#eaf6ff";
        ctx.fillText(texto, x, y);
        ctx.restore();
    }
}



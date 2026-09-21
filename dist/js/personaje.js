/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Personaje (vista)
 * =========================================================
 *
 * IMPORTANTE: esta clase es SOLO presentación.
 *
 * La lógica del personaje (posición, vida, estado vivo, turno) vive en el
 * servidor y llega al cliente dentro del paquete de estado. Aquí únicamente
 * se guarda lo necesario para dibujar: paleta, animación y suavizado.
 *
 * Los recursos visuales están separados de la lógica:
 *  - Si existe assets/images/pollito-N.png (N = 1..6) se dibuja ese sprite.
 *  - Si no existe, se dibuja el pollito vectorial de respaldo.
 * Añadir sprites NO requiere tocar esta lógica: basta con dejar el archivo
 * en la carpeta (ver assets/images/README.md).
 *
 * Animaciones soportadas (llegan del servidor): idle, caminar, salto,
 * disparo, danio y muerto.
 */

/** Caché de sprites compartida por todos los personajes. */
const SPRITES_POLLITOS = new Map();

/**
 * Intenta cargar el sprite de un personaje.
 *
 * @param {number} indicePersonaje Índice del personaje (0..5).
 * @returns {object} { imagen, listo }
 */
function obtenerSprite(indicePersonaje) {
    if (SPRITES_POLLITOS.has(indicePersonaje)) {
        return SPRITES_POLLITOS.get(indicePersonaje);
    }

    const recurso = { imagen: null, listo: false };
    SPRITES_POLLITOS.set(indicePersonaje, recurso);

    const imagen = new Image();
    imagen.src = `assets/images/pollito-${indicePersonaje + 1}.png`;
    imagen.addEventListener("load", () => {
        recurso.listo = true;
    });
    imagen.addEventListener("error", () => {
        // Sin sprite se usa el dibujo vectorial; no es un error del juego.
        recurso.listo = false;
    });
    recurso.imagen = imagen;

    return recurso;
}

class PersonajeVista {
    /**
     * @param {object} datos Datos del jugador enviados por el servidor.
     * @param {object} paleta Colores del personaje.
     */
    constructor(datos, paleta) {
        this.id = datos.id;
        this.nombre = datos.nombre;
        this.indicePersonaje = datos.personaje || 0;
        this.paleta = paleta;
        this.esLocal = false;

        // Posición dibujada (se suaviza hacia el último estado del servidor).
        this.x = datos.x;
        this.y = datos.y;
        this.destinoX = datos.x;
        this.destinoY = datos.y;

        this.vida = datos.vida;
        this.vidaMostrada = datos.vida;
        this.vivo = datos.vivo;
        this.direccion = datos.direccion || 1;
        this.angulo = datos.angulo || 30;
        this.potencia = datos.potencia || 250;
        this.cargando = false;
        this.animacion = datos.animacion || "idle";
        this.enSuelo = datos.enSuelo !== false;
        this.estadisticas = datos.estadisticas || { disparos: 0, danioInfligido: 0, bajas: 0, muertes: 0 };

        this.fase = 0; // Fase de la animación de caminar.
        this.tiempoDanio = 0;
        this.tiempoDisparo = 0;
        this.tiempoParpadeo = Math.random() * 3;
        this.tiempoMuerte = 0;
        this.sprite = obtenerSprite(this.indicePersonaje);
    }

    /**
     * Actualiza los objetivos de posición con un paquete del servidor.
     *
     * @param {object} datos Datos del jugador.
     */
    fijarEstado(datos) {
        if (Math.hypot(datos.x - this.destinoX, datos.y - this.destinoY) > 220) {
            // Teletransporte o reaparición: se evita que el personaje "vuele".
            this.x = datos.x;
            this.y = datos.y;
        }

        this.destinoX = datos.x;
        this.destinoY = datos.y;
        this.vida = datos.vida;
        this.vivo = datos.vivo;
        this.direccion = datos.direccion || 1;
        this.angulo = datos.angulo;
        this.potencia = datos.potencia;
        this.cargando = Boolean(datos.cargando);
        this.animacion = datos.animacion || "idle";
        this.enSuelo = datos.enSuelo !== false;
        this.estadisticas = datos.estadisticas || this.estadisticas;

        if (datos.animacion === "muerto" && !this.vivo) {
            this.tiempoMuerte = Math.min(1.4, this.tiempoMuerte + 0.4);
        }
    }

    /**
     * Marca al personaje como dañado (destello rojo).
     */
    marcarDanio() {
        this.tiempoDanio = 0.45;
    }

    /**
     * Marca al personaje como disparando (retroceso del cañón).
     */
    marcarDisparo() {
        this.tiempoDisparo = 0.3;
    }

    /**
     * Avanza el suavizado y las animaciones locales.
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizar(delta) {
        const suavizado = this.esLocal ? CONFIG_CLIENTE.SUAVIZADO_LOCAL : CONFIG_CLIENTE.SUAVIZADO;
        const factor = Math.min(1, delta * suavizado);

        this.x += (this.destinoX - this.x) * factor;
        this.y += (this.destinoY - this.y) * factor;

        this.vidaMostrada += (this.vida - this.vidaMostrada) * Math.min(1, delta * 8);
        this.fase += delta * (this.animacion === "caminar" ? 9 : 3.2);
        this.tiempoParpadeo += delta;

        if (this.tiempoDanio > 0) {
            this.tiempoDanio -= delta;
        }

        if (this.tiempoDisparo > 0) {
            this.tiempoDisparo -= delta;
        }

        if (!this.vivo) {
            this.tiempoMuerte = Math.min(1.4, this.tiempoMuerte + delta);
        }
    }

    /**
     * Dibuja al personaje completo.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @param {object} opciones { esTurno, mostrarNombres }
     */
    dibujar(ctx, opciones = {}) {
        const esTurno = Boolean(opciones.esTurno);
        const mostrarNombres = opciones.mostrarNombres !== false;

        ctx.save();

        if (esTurno && this.vivo) {
            this.dibujarAroDeTurno(ctx);
        }

        this.dibujarSombra(ctx);

        if (this.vivo) {
            if (this.sprite.listo) {
                this.dibujarSprite(ctx);
            } else {
                this.dibujarVector(ctx);
            }

            this.dibujarCanon(ctx);
        } else {
            this.dibujarCaido(ctx);
        }

        if (mostrarNombres) {
            this.dibujarEtiqueta(ctx, esTurno);
        }

        ctx.restore();
    }

    /**
     * Aro luminoso y flecha sobre el personaje con el turno.
     */
    dibujarAroDeTurno(ctx) {
        const pulso = 0.5 + Math.sin(performance.now() / 220) * 0.5;
        const radio = 26 + pulso * 4;

        ctx.save();
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.5 + pulso * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 17, radio, 8, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#ffd166";
        const salto = Math.sin(performance.now() / 260) * 3;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - 42 + salto);
        ctx.lineTo(this.x - 8, this.y - 54 + salto);
        ctx.lineTo(this.x + 8, this.y - 54 + salto);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    /**
     * Sombra en el suelo.
     */
    dibujarSombra(ctx) {
        ctx.save();
        ctx.globalAlpha = this.vivo ? 0.28 : 0.16;
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 18, 17, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Dibuja el pollito usando el sprite externo si está disponible.
     *
     * El sprite debe mirar a la derecha; se voltea según la dirección.
     */
    dibujarSprite(ctx) {
        const tamano = 46;

        ctx.save();
        ctx.globalAlpha = this.tiempoDanio > 0 && Math.sin(this.tiempoDanio * 40) > 0 ? 0.75 : 1;
        ctx.translate(this.x, this.y - 8);
        ctx.scale(this.direccion < 0 ? -1 : 1, 1);
        ctx.drawImage(this.sprite.imagen, -tamano / 2, -tamano / 2, tamano, tamano);
        ctx.restore();

        if (this.tiempoDanio > 0) {
            this.dibujarDestelloDanio(ctx);
        }
    }

    /**
     * Oscurece o aclara un color hexadecimal.
     *
     * @param {string} color Color en formato #rrggbb.
     * @param {number} cantidad Proporción de oscurecimiento.
     * @returns {string} Color resultante.
     */
    oscurecer(color, cantidad) {
        const valor = color.replace("#", "");
        const numero = parseInt(valor.length === 3 ? valor.split("").map((c) => c + c).join("") : valor, 16);
        const rojo = Math.max(0, ((numero >> 16) & 255) * (1 - cantidad));
        const verde = Math.max(0, ((numero >> 8) & 255) * (1 - cantidad));
        const azul = Math.max(0, (numero & 255) * (1 - cantidad));

        return `rgb(${Math.round(rojo)}, ${Math.round(verde)}, ${Math.round(azul)})`;
    }

    /**
     * Dibuja el pollito vectorial (respaldo cuando no hay sprites).
     *
     * Animaciones: idle (respiración), caminar (patas y ala), salto (patas
     * recogidas), disparo (retroceso) y daño (destello rojo).
     */
    dibujarVector(ctx) {
        const paleta = this.paleta;
        const respiracion = this.animacion === "idle" ? Math.sin(this.fase) * 1.2 : 0;
        const caminando = this.animacion === "caminar";
        const saltando = this.animacion === "salto";
        const balanceoPatas = caminando ? Math.sin(this.fase) * 4 : 0;
        const aleteo = caminando ? Math.abs(Math.sin(this.fase)) * 5 : saltando ? 7 : 1.5;
        const retroceso = this.tiempoDisparo > 0 ? this.tiempoDisparo * 12 : 0;
        const centroX = this.x - this.direccion * retroceso;
        const centroY = this.y + respiracion;

        ctx.save();

        // Patas.
        ctx.strokeStyle = "#f08c1a";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();

        if (saltando) {
            ctx.moveTo(centroX - 5, centroY + 8);
            ctx.lineTo(centroX - 8, centroY + 14);
            ctx.moveTo(centroX + 4, centroY + 8);
            ctx.lineTo(centroX + 7, centroY + 14);
        } else {
            ctx.moveTo(centroX - 5, centroY + 8);
            ctx.lineTo(centroX - 5 + balanceoPatas, centroY + 17);
            ctx.moveTo(centroX + 5, centroY + 8);
            ctx.lineTo(centroX + 5 - balanceoPatas, centroY + 17);
        }

        ctx.stroke();

        // Cola de plumas.
        ctx.fillStyle = this.oscurecer(paleta.cuerpo, 0.15);
        ctx.beginPath();
        ctx.moveTo(centroX - this.direccion * 14, centroY - 2);
        ctx.lineTo(centroX - this.direccion * 26, centroY - 12);
        ctx.lineTo(centroX - this.direccion * 24, centroY + 6);
        ctx.closePath();
        ctx.fill();

        // Cuerpo.
        ctx.fillStyle = paleta.cuerpo;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(centroX, centroY, 18, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Ala (se levanta al caminar o saltar).
        ctx.save();
        ctx.translate(centroX - this.direccion * 4, centroY - 3);
        ctx.rotate(this.direccion * (-0.25 - aleteo * 0.03));
        ctx.fillStyle = this.oscurecer(paleta.cuerpo, 0.12);
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Cabeza.
        const cabezaX = centroX + this.direccion * 6;
        const cabezaY = centroY - 14;
        ctx.fillStyle = paleta.cuerpo;
        ctx.beginPath();
        ctx.arc(cabezaX, cabezaY, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cresta.
        ctx.fillStyle = paleta.cresta;
        ctx.beginPath();
        ctx.arc(cabezaX - 3, cabezaY - 10, 4, Math.PI, 0);
        ctx.arc(cabezaX + 3, cabezaY - 11, 4, Math.PI, 0);
        ctx.fill();

        // Pico.
        ctx.fillStyle = paleta.pico;
        ctx.beginPath();
        ctx.moveTo(cabezaX + this.direccion * 8, cabezaY - 1);
        ctx.lineTo(cabezaX + this.direccion * 19, cabezaY + 2);
        ctx.lineTo(cabezaX + this.direccion * 8, cabezaY + 6);
        ctx.closePath();
        ctx.fill();

        // Ojo (parpadea cada pocos segundos).
        const cerrado = (this.tiempoParpadeo % 3.4) > 3.25;

        if (cerrado) {
            ctx.strokeStyle = "#22303c";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cabezaX + this.direccion * 2, cabezaY - 2);
            ctx.lineTo(cabezaX + this.direccion * 7, cabezaY - 2);
            ctx.stroke();
        } else {
            ctx.fillStyle = "#22303c";
            ctx.beginPath();
            ctx.arc(cabezaX + this.direccion * 4, cabezaY - 2, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(cabezaX + this.direccion * 5, cabezaY - 3.5, 1.1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Mejilla.
        ctx.fillStyle = "rgba(255, 140, 140, 0.45)";
        ctx.beginPath();
        ctx.arc(cabezaX + this.direccion, cabezaY + 4, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        if (this.tiempoDanio > 0) {
            this.dibujarDestelloDanio(ctx);
        }
    }

    /**
     * Destello rojo al recibir daño.
     */
    dibujarDestelloDanio(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.55, this.tiempoDanio);
        ctx.fillStyle = "#ff4d4d";
        ctx.beginPath();
        ctx.arc(this.x, this.y - 4, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Dibuja el cañón apuntando según el ángulo confirmado por el servidor.
     *
     * La fórmula es la misma del Cañón original (punta = centro + cos/sin *
     * longitud * dirección), por eso la bala sale exactamente de la boca.
     */
    dibujarCanon(ctx) {
        const longitud = CONFIG_CLIENTE.LONGITUD_CANON;
        const radianes = (this.angulo * Math.PI) / 180;
        const direccion = this.direccion;
        const baseX = this.x;
        const baseY = this.y - 4;
        const puntaX = baseX + Math.cos(radianes) * longitud * direccion;
        const puntaY = baseY - Math.sin(radianes) * longitud;

        ctx.save();

        // Cuerpo del cañón con degradado.
        const gradiente = ctx.createLinearGradient(baseX, baseY, puntaX, puntaY);
        gradiente.addColorStop(0, "#3d4a55");
        gradiente.addColorStop(1, "#1b2229");
        ctx.strokeStyle = gradiente;
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(puntaX, puntaY);
        ctx.stroke();

        // Brillo superior del metal.
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY - 2);
        ctx.lineTo(puntaX, puntaY - 2);
        ctx.stroke();

        // Boca del cañón.
        ctx.fillStyle = "#111820";
        ctx.beginPath();
        ctx.arc(puntaX, puntaY, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Resplandor de carga: crece con la potencia real del servidor.
        if (this.cargando && this.vivo) {
            const rango = CONFIG_CLIENTE.POTENCIA_MAXIMA - CONFIG_CLIENTE.POTENCIA_MINIMA;
            const proporcion = Math.max(0, Math.min(1, (this.potencia - CONFIG_CLIENTE.POTENCIA_MINIMA) / rango));
            const radio = 4 + proporcion * 12;
            const halo = ctx.createRadialGradient(puntaX, puntaY, 1, puntaX, puntaY, radio * 2);
            halo.addColorStop(0, "rgba(255, 240, 180, 0.95)");
            halo.addColorStop(0.5, `rgba(255, 170, 60, ${0.5 + proporcion * 0.4})`);
            halo.addColorStop(1, "rgba(255, 120, 40, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(puntaX, puntaY, radio * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Dibuja al pollito eliminado: aparece caído, con el ojo en cruz.
     */
    dibujarCaido(ctx) {
        const opacidad = 0.9 - this.tiempoMuerte * 0.35;
        const paleta = this.paleta;

        ctx.save();
        ctx.globalAlpha = Math.max(0.35, opacidad);
        ctx.translate(this.x, this.y + 8);
        ctx.rotate(this.direccion < 0 ? 0.3 : -0.3);

        // Cuerpo caído.
        ctx.fillStyle = this.oscurecer(paleta.cuerpo, 0.25);
        ctx.beginPath();
        ctx.ellipse(0, 0, 19, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ala extendida.
        ctx.fillStyle = this.oscurecer(paleta.cuerpo, 0.4);
        ctx.beginPath();
        ctx.ellipse(-4, -4, 11, 6, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.rotate(0.55);

        // Cabeza.
        ctx.fillStyle = this.oscurecer(paleta.cuerpo, 0.15);
        ctx.beginPath();
        ctx.arc(12, -4, 10, 0, Math.PI * 2);
        ctx.fill();

        // Cresta apagada.
        ctx.fillStyle = this.oscurecer(paleta.cresta, 0.4);
        ctx.beginPath();
        ctx.arc(11, -13, 4, Math.PI, 0);
        ctx.fill();

        // Pico abierto.
        ctx.fillStyle = this.oscurecer(paleta.pico, 0.2);
        ctx.beginPath();
        ctx.moveTo(21, -6);
        ctx.lineTo(29, -3);
        ctx.lineTo(21, 0);
        ctx.closePath();
        ctx.fill();

        // Ojo en cruz.
        ctx.strokeStyle = "#22303c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(12, -7);
        ctx.lineTo(17, -2);
        ctx.moveTo(17, -7);
        ctx.lineTo(12, -2);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    /**
     * Dibuja el nombre y la barra de vida sobre el personaje.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @param {boolean} esTurno Si es el personaje con el turno actual.
     */
    dibujarEtiqueta(ctx, esTurno) {
        const anchoBarra = 48;
        const altoBarra = 6;
        const porcentaje = Math.max(0, Math.min(1, this.vidaMostrada / 100));
        const inicioX = this.x - anchoBarra / 2;
        const barraY = this.y - 48;
        const colorVida = porcentaje > 0.6 ? "#4ddf7d" : porcentaje > 0.3 ? "#ffd166" : "#ff6b6b";
        const etiqueta = `${this.esLocal ? "TÚ " : ""}${this.nombre}`;
        const bajas = this.estadisticas.bajas > 0 ? ` ☠${this.estadisticas.bajas}` : "";

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 11px 'Trebuchet MS', Verdana, sans-serif";

        // Nombre con contorno para que se lea sobre cualquier fondo.
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(3, 12, 22, 0.85)";
        ctx.strokeText(`${etiqueta}${bajas}`, this.x, barraY - 6);

        ctx.fillStyle = this.vivo ? (esTurno ? "#ffd166" : "#eaf6ff") : "#9fb3c4";
        ctx.fillText(`${etiqueta}${bajas}`, this.x, barraY - 6);

        // Barra de vida.
        ctx.fillStyle = "rgba(3, 12, 22, 0.85)";
        ctx.fillRect(inicioX - 1, barraY - 1, anchoBarra + 2, altoBarra + 2);
        ctx.fillStyle = this.vivo ? colorVida : "#54606b";
        ctx.fillRect(inicioX, barraY, anchoBarra * porcentaje, altoBarra);

        // Valor de vida.
        ctx.font = "bold 9px 'Trebuchet MS', Verdana, sans-serif";
        ctx.fillStyle = this.vivo ? "#ffffff" : "#ffb0b0";
        ctx.fillText(this.vivo ? String(Math.round(this.vidaMostrada)) : "ELIMINADO", this.x, barraY + 6);

        ctx.restore();
    }
}





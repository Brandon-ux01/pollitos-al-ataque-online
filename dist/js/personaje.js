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
 * Los dibujos son de RECURSOS (js/recursos.js): cada personaje tiene una
 * carpeta con un fotograma por estado (quieto, caminar, salto, disparo, danio
 * y muerto). Si la imagen todavía no ha cargado (o falta el archivo) se dibuja
 * el pollito vectorial de respaldo, así el juego nunca se queda en blanco.
 *
 * Animación: los fotogramas son dibujos fijos, así que el movimiento se
 * consigue en el momento de pintar (estirado, aplastado, balanceo y retroceso),
 * igual que en los juegos de dibujos animados.
 *
 * Animaciones soportadas (llegan del servidor): idle, caminar, salto,
 * disparo, danio y muerto.
 */

/** Alto con el que se dibuja un pollito en la arena (el radio físico es 17). */
const ALTO_POLLITO = 58;

/** Nombre de animación del servidor -> estado de dibujo. */
const ESTADOS_DE_ANIMACION = {
    idle: "quieto",
    quieto: "quieto",
    caminar: "caminar",
    correr: "caminar",
    salto: "salto",
    saltar: "salto",
    disparo: "disparo",
    danio: "danio",
    dano: "danio",
    muerto: "muerto"
};


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
        this.ficha = Recursos.pollito(this.indicePersonaje);
    }

    /**
     * Estado de dibujo que corresponde al momento actual.
     *
     * @returns {string} quieto, caminar, salto, disparo, danio o muerto.
     */
    estadoDeDibujo() {
        if (!this.vivo) {
            return "muerto";
        }

        if (this.animacion === "disparo" || this.tiempoDisparo > 0.18) {
            return "disparo";
        }

        if (this.animacion === "danio" || this.tiempoDanio > 0.25) {
            return "danio";
        }

        if (this.animacion === "salto" || !this.enSuelo) {
            return "salto";
        }

        return ESTADOS_DE_ANIMACION[this.animacion] || "quieto";
    }

    /**
     * Imagen del estado actual (o null si todavía no está cargada).
     *
     * @returns {HTMLImageElement|null}
     */
    imagenActual() {
        return Recursos.imagen(Recursos.rutaPollito(this.indicePersonaje, this.estadoDeDibujo()));
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
            if (!this.dibujarSprite(ctx)) {
                this.dibujarVector(ctx);
            }

            this.dibujarCanon(ctx);
        } else if (!this.dibujarCaidoConArte(ctx)) {
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
     * Dibuja el pollito con su dibujo de verdad y lo anima al pintarlo.
     *
     * Movimiento de dibujos animados:
     *  - quieto  : respira (sube y baja) y se aplasta un poco al exhalar.
     *  - caminar : se balancea de lado a lado y da saltitos.
     *  - salto   : se estira (más alto y más estrecho).
     *  - disparo : retrocede y se aplasta por el culatazo.
     *  - daño    : tiembla y se aplasta.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @returns {boolean} false si el dibujo no está disponible (respaldo vectorial).
     */
    dibujarSprite(ctx) {
        const imagen = this.imagenActual();

        if (!imagen) {
            return false;
        }

        const estado = this.estadoDeDibujo();
        const direccion = this.direccion < 0 ? -1 : 1;
        const paso = Math.sin(this.fase);
        const baseY = this.y + 17; // Línea de los pies (coincide con el suelo de la sombra).

        let subida = 0;
        let giro = 0;
        let estirado = 1;
        let desplazamiento = 0;

        if (estado === "caminar") {
            // Bamboleo y saltito al dar cada paso.
            giro = paso * 0.06;
            subida = -Math.abs(paso) * 1.6;
            estirado = 1 + Math.abs(paso) * 0.02;
        } else if (estado === "salto") {
            giro = direccion * 0.05;
            estirado = 1.07;
        } else if (estado === "disparo") {
            // Retroceso: se echa hacia atrás y se aplasta.
            const retroceso = Math.max(0, this.tiempoDisparo) / 0.3;
            desplazamiento = -direccion * retroceso * 6;
            giro = -direccion * retroceso * 0.06;
            estirado = 1 - retroceso * 0.03;
        } else if (estado === "danio") {
            desplazamiento = Math.sin(this.tiempoDanio * 70) * 2.2;
            estirado = 0.96;
        } else {
            // Quieto: respiración suave.
            subida = paso * 0.9;
            giro = paso * 0.015;
            estirado = 1 + paso * 0.012;
        }

        const anchoBase = ALTO_POLLITO * (imagen.naturalWidth / imagen.naturalHeight);
        const opacidad = this.tiempoDanio > 0 && Math.sin(this.tiempoDanio * 40) > 0 ? 0.8 : 1;

        ctx.save();
        ctx.globalAlpha = opacidad;
        ctx.translate(this.x + desplazamiento, baseY + subida);
        ctx.rotate(giro);
        // El estirado conserva el volumen: lo que crece de alto se estrecha.
        ctx.scale(direccion * (1 / estirado), estirado);
        ctx.drawImage(imagen, -anchoBase / 2, -ALTO_POLLITO, anchoBase, ALTO_POLLITO);
        ctx.restore();

        if (this.tiempoDanio > 0) {
            this.dibujarDestelloDanio(ctx);
        }

        return true;
    }

    /**
     * Dibuja el pollito eliminado con su dibujo de "muerto".
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @returns {boolean} false si el dibujo no está disponible.
     */
    dibujarCaidoConArte(ctx) {
        const imagen = Recursos.imagen(Recursos.rutaPollito(this.indicePersonaje, "muerto"));

        if (!imagen) {
            return false;
        }

        const alto = ALTO_POLLITO * 0.8;
        const ancho = alto * (imagen.naturalWidth / imagen.naturalHeight);
        const opacidad = Math.max(0.45, 0.95 - this.tiempoMuerte * 0.3);

        ctx.save();
        ctx.globalAlpha = opacidad;
        ctx.translate(this.x, this.y + 16);
        ctx.rotate((this.direccion < 0 ? 1 : -1) * 0.16);
        ctx.scale(this.direccion < 0 ? -1 : 1, 1);
        ctx.drawImage(imagen, -ancho / 2, -alto, ancho, alto);
        ctx.restore();

        return true;
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
     *
     * Estilo: barril grueso de dibujos animados (contorno oscuro, cuerpo
     * naranja con degradado, anillos dorados y culata redonda). El dibujo de
     * assets/imagenes/interfaz/armas/canon.png NO se usa aquí: a 34 px de
     * barril pierde todo el detalle (ver utilidades/prueba_arma.ps1); se usa
     * como adorno del menú, a tamaño grande.
     */
    dibujarCanon(ctx) {
        const longitud = CONFIG_CLIENTE.LONGITUD_CANON;
        const radianes = (this.angulo * Math.PI) / 180;
        const direccion = this.direccion;
        const baseX = this.x;
        const baseY = this.y - 4;
        const puntaX = baseX + Math.cos(radianes) * longitud * direccion;
        const puntaY = baseY - Math.sin(radianes) * longitud;

        // Perpendicular "hacia arriba" del barril: sirve para el brillo.
        const perpX = Math.sin(radianes) * direccion;
        const perpY = -Math.cos(radianes);
        const brillo = 3.5;

        ctx.save();
        ctx.lineCap = "round";

        // 1. Contorno oscuro (el borde de dibujo animado).
        ctx.strokeStyle = "#2b1408";
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(puntaX, puntaY);
        ctx.stroke();

        // 2. Cuerpo del barril con degradado naranja.
        const gradiente = ctx.createLinearGradient(baseX, baseY, puntaX, puntaY);
        gradiente.addColorStop(0, "#ffb347");
        gradiente.addColorStop(1, "#e2571a");
        ctx.strokeStyle = gradiente;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(puntaX, puntaY);
        ctx.stroke();

        // 3. Reflejo superior del metal.
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(baseX + perpX * brillo, baseY + perpY * brillo);
        ctx.lineTo(puntaX + perpX * brillo, puntaY + perpY * brillo);
        ctx.stroke();

        // 4. Anillos dorados del barril.
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 4;

        [0.4, 0.72].forEach((posicion) => {
            const centroX = baseX + (puntaX - baseX) * posicion;
            const centroY = baseY + (puntaY - baseY) * posicion;

            ctx.beginPath();
            ctx.moveTo(centroX - perpX * 8, centroY - perpY * 8);
            ctx.lineTo(centroX + perpX * 8, centroY + perpY * 8);
            ctx.stroke();
        });

        // 5. Culata (la recámara, apoyada en el cuerpo del pollito).
        ctx.fillStyle = "#3a2010";
        ctx.beginPath();
        ctx.arc(baseX, baseY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 6. Boca del cañón.
        ctx.fillStyle = "#241206";
        ctx.beginPath();
        ctx.arc(puntaX, puntaY, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 7. Fogonazo del disparo.
        if (this.tiempoDisparo > 0.2) {
            const fuerza = (this.tiempoDisparo - 0.2) / 0.1;

            ctx.globalAlpha = Math.max(0, Math.min(1, fuerza));
            ctx.fillStyle = "#fff3c4";
            ctx.beginPath();
            ctx.arc(puntaX, puntaY, 5 + fuerza * 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255, 170, 60, 0.7)";
            ctx.beginPath();
            ctx.arc(puntaX, puntaY, 9 + fuerza * 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // 8. Resplandor de carga: crece con la potencia real del servidor.
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
        const anchoBarra = 54;
        const altoBarra = 9;
        const porcentaje = Math.max(0, Math.min(1, this.vidaMostrada / 100));
        const inicioX = this.x - anchoBarra / 2;
        const barraY = this.y - 52;
        const colorVida = porcentaje > 0.6 ? "#5ce07a" : porcentaje > 0.3 ? "#ffd166" : "#ff6b6b";
        const etiqueta = `${this.esLocal ? "TÚ " : ""}${this.nombre}`;
        const bajas = this.estadisticas.bajas > 0 ? ` ☠${this.estadisticas.bajas}` : "";
        const texto = `${etiqueta}${bajas}`;

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 12px 'Trebuchet MS', Verdana, sans-serif";

        // Nombre con contorno grueso (estilo dibujo animado).
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(11, 26, 43, 0.92)";
        ctx.strokeText(texto, this.x, barraY - 7);

        ctx.fillStyle = !this.vivo ? "#9fb3c4" : esTurno ? "#ffd166" : "#ffffff";
        ctx.fillText(texto, this.x, barraY - 7);

        // Barra de vida redondeada con borde oscuro y brillo.
        ctx.beginPath();
        ctx.roundRect(inicioX, barraY - 2, anchoBarra, altoBarra, altoBarra / 2);
        ctx.fillStyle = "rgba(11, 26, 43, 0.9)";
        ctx.fill();

        if (porcentaje > 0.02) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(inicioX + 1.5, barraY - 0.5, (anchoBarra - 3) * porcentaje, altoBarra - 3, altoBarra / 2);
            ctx.clip();
            ctx.fillStyle = this.vivo ? colorVida : "#54606b";
            ctx.fillRect(inicioX, barraY - 2, anchoBarra, altoBarra);
            ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
            ctx.fillRect(inicioX, barraY - 1.5, anchoBarra, 2.5);
            ctx.restore();
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(11, 26, 43, 0.95)";
        ctx.beginPath();
        ctx.roundRect(inicioX, barraY - 2, anchoBarra, altoBarra, altoBarra / 2);
        ctx.stroke();

        // Valor de vida.
        ctx.font = "bold 10px 'Trebuchet MS', Verdana, sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(11, 26, 43, 0.9)";
        const valor = this.vivo ? String(Math.round(this.vidaMostrada)) : "FUERA";
        ctx.strokeText(valor, this.x, barraY + 8);
        ctx.fillStyle = this.vivo ? "#eaf6ff" : "#ffb0b0";
        ctx.fillText(valor, this.x, barraY + 8);

        ctx.restore();
    }
}





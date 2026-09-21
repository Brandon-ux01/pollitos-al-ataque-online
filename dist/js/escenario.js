/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Escenario de fondo
 * =========================================================
 *
 * Todo el ambiente se dibuja con formas (sin imágenes incrustadas en el
 * código). Si más adelante se quieren usar imágenes, basta con sustituir los
 * métodos de dibujo por drawImage de assets/images/ (ver assets/images/README).
 *
 * Capas, de atrás hacia delante:
 *  1. Cielo con degradado y sol.
 *  2. Nubes con movimiento lento (paralaje).
 *  3. Montañas lejanas.
 *  4. Mar al pie del mapa, con olas animadas.
 *  5. Decoración (arbustos, vallas) sobre las plataformas.
 */

class Escenario {
    /**
     * @param {number} ancho Ancho del mundo.
     * @param {number} alto Alto del mundo.
     */
    constructor(ancho, alto) {
        this.ancho = ancho;
        this.alto = alto;
        this.tiempo = 0;
        this.nivelMar = 536;

        // Nubes generadas una vez: se mueven y se repiten en bucle.
        this.nubes = Array.from({ length: 7 }, (indice, posicion) => ({
            x: (posicion / 7) * ancho + Math.random() * 120,
            y: 40 + Math.random() * 150,
            escala: 0.7 + Math.random() * 0.9,
            velocidad: 4 + Math.random() * 9,
            opacidad: 0.35 + Math.random() * 0.4
        }));

        // Colinas lejanas: dos capas de siluetas suaves.
        this.colinas = [
            this.crearColina(90, 18, 0.6),
            this.crearColina(150, 26, 0.85)
        ];
    }

    /**
     * Genera el perfil de una capa de colinas.
     *
     * @param {number} alturaBase Altura media de la capa.
     * @param {number} amplitud Variación de la altura.
     * @param {number} opacidad Opacidad de la capa.
     * @returns {object}
     */
    crearColina(alturaBase, amplitud, opacidad) {
        const puntos = [];

        for (let x = -40; x <= this.ancho + 40; x += 40) {
            puntos.push({
                x,
                y: this.alto - this.nivelMar - alturaBase + Math.sin(x * 0.004 + opacidad * 12) * amplitud
            });
        }

        return { puntos, opacidad };
    }

    /**
     * Actualiza el ambiente (nubes y agua).
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizar(delta) {
        this.tiempo += delta;

        this.nubes.forEach((nube) => {
            nube.x += nube.velocidad * delta * nube.escala;

            if (nube.x - 120 * nube.escala > this.ancho) {
                nube.x = -140 * nube.escala;
                nube.y = 40 + Math.random() * 150;
            }
        });
    }

    /**
     * Dibuja los planos de cielo, sol, nubes y colinas.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarCielo(ctx) {
        const gradiente = ctx.createLinearGradient(0, 0, 0, this.alto);
        gradiente.addColorStop(0, "#0b2d52");
        gradiente.addColorStop(0.45, "#1d5b86");
        gradiente.addColorStop(1, "#3d8fa3");
        ctx.fillStyle = gradiente;
        ctx.fillRect(0, 0, this.ancho, this.alto);

        // Sol con halo.
        const halo = ctx.createRadialGradient(940, 96, 8, 940, 96, 120);
        halo.addColorStop(0, "rgba(255, 236, 168, 0.95)");
        halo.addColorStop(0.35, "rgba(255, 214, 120, 0.35)");
        halo.addColorStop(1, "rgba(255, 214, 120, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(940, 96, 120, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffe8a3";
        ctx.beginPath();
        ctx.arc(940, 96, 34, 0, Math.PI * 2);
        ctx.fill();

        // Nubes.
        this.nubes.forEach((nube) => {
            ctx.save();
            ctx.globalAlpha = nube.opacidad;
            ctx.fillStyle = "#dfefff";
            ctx.translate(nube.x, nube.y);
            ctx.scale(nube.escala, nube.escala * 0.8);
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 2);
            ctx.arc(28, 6, 20, 0, Math.PI * 2);
            ctx.arc(-28, 8, 18, 0, Math.PI * 2);
            ctx.arc(6, -14, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Colinas.
        this.colinas.forEach((capa) => {
            ctx.save();
            ctx.globalAlpha = capa.opacidad;
            ctx.fillStyle = "#12455f";
            ctx.beginPath();
            ctx.moveTo(capa.puntos[0].x, this.alto);

            capa.puntos.forEach((punto) => ctx.lineTo(punto.x, punto.y));

            ctx.lineTo(capa.puntos[capa.puntos.length - 1].x, this.alto);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    }

    /**
     * Dibuja el mar por delante del terreno, con olas animadas.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarMar(ctx) {
        ctx.save();

        ctx.beginPath();
        ctx.moveTo(0, this.nivelMar + Math.sin(this.tiempo * 1.6) * 3);

        for (let x = 0; x <= this.ancho; x += 30) {
            const ola = Math.sin(x * 0.05 + this.tiempo * 2.2) * 4 + Math.sin(x * 0.013 + this.tiempo) * 3;
            ctx.lineTo(x, this.nivelMar + ola);
        }

        ctx.lineTo(this.ancho, this.alto);
        ctx.lineTo(0, this.alto);
        ctx.closePath();

        const gradiente = ctx.createLinearGradient(0, this.nivelMar, 0, this.alto);
        gradiente.addColorStop(0, "rgba(38, 130, 168, 0.55)");
        gradiente.addColorStop(1, "rgba(11, 56, 84, 0.92)");
        ctx.fillStyle = gradiente;
        ctx.fill();

        ctx.strokeStyle = "rgba(160, 235, 255, 0.65)";
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let x = 0; x <= this.ancho; x += 20) {
            const ola = Math.sin(x * 0.05 + this.tiempo * 2.2) * 4 + Math.sin(x * 0.013 + this.tiempo) * 3;
            const y = this.nivelMar + ola;

            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
        ctx.restore();
    }

    /**
     * Dibuja decoración fija apoyada en el terreno (arbustos y vallas).
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @param {Array} plataformas Plataformas del mundo.
     */
    dibujarDecoracion(ctx, plataformas) {
        ctx.save();

        plataformas.forEach((plataforma, indice) => {
            if (plataforma.alto < 24) {
                return;
            }

            const base = plataforma.y + 2;

            // Arbusto a la izquierda de la plataforma.
            const x = plataforma.x + 18 + (indice % 3) * 10;

            ctx.fillStyle = "rgba(24, 92, 52, 0.9)";
            ctx.beginPath();
            ctx.arc(x, base - 6, 12, Math.PI, 0);
            ctx.arc(x + 14, base - 4, 10, Math.PI, 0);
            ctx.fill();

            ctx.fillStyle = "rgba(40, 130, 70, 0.85)";
            ctx.beginPath();
            ctx.arc(x + 5, base - 9, 9, Math.PI, 0);
            ctx.fill();

            // Valla de madera en plataformas anchas.
            if (plataforma.ancho > 150 && indice % 4 === 0) {
                const vallaX = plataforma.x + plataforma.ancho - 60;

                ctx.fillStyle = "#6b4426";
                ctx.fillRect(vallaX, base - 22, 4, 22);
                ctx.fillRect(vallaX + 24, base - 22, 4, 22);
                ctx.fillRect(vallaX - 4, base - 16, 36, 5);
            }
        });

        ctx.restore();
    }
}


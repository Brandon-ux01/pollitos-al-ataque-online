/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Explosión
 * =========================================================
 *
 * Efecto visual de una explosión. La duración y el radio se reciben del
 * servidor (radio 60 al tocar terreno y 65 al tocar un personaje, igual que
 * el juego original), de modo que el efecto siempre coincide con el daño
 * real que se aplicó.
 *
 * Se dibuja en tres capas: destello central, anillo de choque y humo.
 */

class Explosion {
    /**
     * @param {number} x Centro horizontal.
     * @param {number} y Centro vertical.
     * @param {number} radio Radio del daño.
     * @param {string} color Color del efecto.
     * @param {number} duracion Duración en segundos.
     */
    constructor(x, y, radio, color = "#ffb347", duracion = 0.7) {
        this.x = x;
        this.y = y;
        this.radio = radio;
        this.color = color;
        this.maxima = duracion;
        this.tiempo = 0;
        this.activa = true;
    }

    /**
     * Avanza la animación de la explosión.
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizar(delta) {
        this.tiempo += delta;

        if (this.tiempo >= this.maxima) {
            this.activa = false;
        }
    }

    /**
     * Dibuja la explosión.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujar(ctx) {
        if (!this.activa) {
            return;
        }

        const progreso = Math.min(1, this.tiempo / this.maxima);
        const radioActual = this.radio * (0.25 + progreso * 1.15);
        const intensidad = 1 - progreso;

        ctx.save();

        // Humo que se expande y se apaga.
        ctx.globalAlpha = intensidad * 0.5;
        ctx.fillStyle = "rgba(60, 48, 36, 0.75)";
        ctx.beginPath();
        ctx.arc(this.x, this.y, radioActual * 1.15, 0, Math.PI * 2);
        ctx.fill();

        // Núcleo brillante.
        const nucleo = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, radioActual);
        nucleo.addColorStop(0, "#fffbe8");
        nucleo.addColorStop(0.45, this.color);
        nucleo.addColorStop(1, "rgba(255, 120, 40, 0)");
        ctx.globalAlpha = intensidad;
        ctx.fillStyle = nucleo;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radioActual, 0, Math.PI * 2);
        ctx.fill();

        // Anillo de choque.
        ctx.globalAlpha = intensidad * 0.9;
        ctx.strokeStyle = "#fff1c4";
        ctx.lineWidth = 3 * intensidad + 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radioActual * 1.05, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}

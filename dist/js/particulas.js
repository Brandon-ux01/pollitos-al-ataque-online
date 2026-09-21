/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Partículas
 * =========================================================
 *
 * Sistema sencillo de partículas para explosiones, disparos, plumas de
 * muerte y polvo de impacto. Se conserva la API del juego original
 * (crear / actualizar / dibujar) ampliada con un objeto de opciones.
 */

class Particulas {
    /**
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.lista = [];
        this.maximo = 900; // Límite de seguridad para no degradar el rendimiento.
    }

    /**
     * Crea un grupo de partículas.
     *
     * @param {number} x Origen horizontal.
     * @param {number} y Origen vertical.
     * @param {string} color Color base.
     * @param {number} cantidad Cantidad de partículas.
     * @param {number} fuerza Velocidad inicial.
     * @param {object} opciones { gravedad, vida, radio, forma, dispersion }.
     */
    crear(x, y, color, cantidad = 12, fuerza = 160, opciones = {}) {
        const gravedad = opciones.gravedad === undefined ? 220 : opciones.gravedad;
        const vida = opciones.vida || 0.8;
        const radio = opciones.radio || 4;
        const forma = opciones.forma || "circulo";
        const dispersion = opciones.dispersion || 0;

        for (let indice = 0; indice < cantidad; indice++) {
            if (this.lista.length >= this.maximo) {
                return;
            }

            const angulo = (Math.PI * 2 * indice) / cantidad + Math.random() * (0.8 + dispersion);
            const velocidad = Math.random() * fuerza + 30;

            this.lista.push({
                x,
                y,
                vx: Math.cos(angulo) * velocidad,
                vy: Math.sin(angulo) * velocidad - (opciones.empujeArriba || 0),
                radio: 1.5 + Math.random() * radio,
                color,
                forma,
                giro: Math.random() * Math.PI,
                velocidadGiro: (Math.random() - 0.5) * 8,
                gravedad,
                vida: vida * (0.6 + Math.random() * 0.8),
                vidaActual: 0
            });
        }
    }

    /** Atajo: chispas de un disparo. */
    chispasDisparo(x, y) {
        this.crear(x, y, "#ffe8a3", 8, 110, { vida: 0.35, radio: 3, gravedad: 120 });
    }

    /** Atajo: plumas de un pollito eliminado. */
    plumasMuerte(x, y, color) {
        this.crear(x, y - 8, color, 16, 130, {
            vida: 1.6,
            radio: 5,
            gravedad: 90,
            forma: "pluma",
            dispersion: 1.2,
            empujeArriba: 60
        });
    }

    /** Atajo: humo y tierra de una explosión. */
    humoExplosion(x, y) {
        this.crear(x, y, "rgba(70, 55, 40, 0.85)", 14, 150, { vida: 1.1, radio: 7, gravedad: 60 });
        this.crear(x, y, "#ffd166", 16, 230, { vida: 0.7, radio: 5, gravedad: 180 });
    }

    /**
     * Actualiza todas las partículas.
     *
     * @param {number} delta Segundos transcurridos.
     */
    actualizar(delta) {
        this.lista = this.lista.filter((particula) => {
            particula.x += particula.vx * delta;
            particula.y += particula.vy * delta;
            particula.vy += particula.gravedad * delta;
            particula.vx *= 1 - Math.min(0.9, delta * 0.6);
            particula.giro += particula.velocidadGiro * delta;
            particula.vidaActual += delta;
            return particula.vidaActual < particula.vida;
        });
    }

    /**
     * Dibuja todas las partículas.
     */
    dibujar() {
        const ctx = this.ctx;

        ctx.save();

        this.lista.forEach((particula) => {
            const alpha = Math.max(0, 1 - particula.vidaActual / particula.vida);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particula.color;
            ctx.translate(particula.x, particula.y);
            ctx.rotate(particula.giro);

            if (particula.forma === "pluma") {
                ctx.beginPath();
                ctx.ellipse(0, 0, particula.radio * 1.6, particula.radio * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, particula.radio, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.rotate(-particula.giro);
            ctx.translate(-particula.x, -particula.y);
        });

        ctx.restore();
    }

    /** Vacía todas las partículas (al cambiar de pantalla o de partida). */
    limpiar() {
        this.lista = [];
    }
}

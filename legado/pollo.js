/**
 * Clase Pollo
 *
 * Representa al equipo del jugador.
 */
class Pollo {
    constructor(nombre, x, y) {
        this.nombre = nombre;
        this.vidaMaxima = 100;
        this.vida = 100;
        this.x = x;
        this.y = y;
        this.radio = 17;
        this.velocidad = 140;
        this.velocidadX = 0;
        this.velocidadY = 0;
        this.fuerzaSalto = 300;
        this.gravedad = 900;
        this.enSuelo = false;
        this.direccion = 1;
        this.vivo = true;
        this.disparoRealizado = false;
        this.esJugador = true;
        this.canon = new Canon(this);
    }

    actualizar(delta, terreno) {
        if (!this.vivo) return;

        // Posición vertical previa: sirve para detectar si los pies
        // cruzaron la superficie de una plataforma en este fotograma.
        const yAnterior = this.y;

        this.velocidadY += this.gravedad * delta;
        this.x += this.velocidadX * delta;
        this.y += this.velocidadY * delta;

        if (this.x < this.radio) this.x = this.radio;
        if (this.x > terreno.ancho - this.radio) {
            this.x = terreno.ancho - this.radio;
        }

        this.enSuelo = false;

        // Superficie más alta sobre la que el pollo queda apoyado.
        let superficie = null;

        terreno.plataformas.forEach((plataforma) => {
            const dentroHorizontal = this.x + this.radio > plataforma.x &&
                this.x - this.radio < plataforma.x + plataforma.ancho;

            if (!dentroHorizontal) {
                return;
            }

            const pies = this.y + this.radio;
            const piesAnteriores = yAnterior + this.radio;

            // Apoyo normal: los pies descansan sobre la superficie.
            const estaApoyado = this.velocidadY >= 0 &&
                pies >= plataforma.y &&
                pies <= plataforma.y + 25;

            // Cruce de la superficie durante este fotograma. Evita que el
            // pollo atraviese la plataforma cuando el paso de tiempo fue
            // grande (un fotograma que llegó muy tarde) o cuando cae muy
            // rápido.
            const cruzoLaSuperficie = this.velocidadY > 0 &&
                piesAnteriores <= plataforma.y + 1 &&
                pies >= plataforma.y;

            if (!estaApoyado && !cruzoLaSuperficie) {
                return;
            }

            if (superficie === null || plataforma.y < superficie) {
                superficie = plataforma.y;
            }
        });

        if (superficie !== null) {
            this.y = superficie - this.radio;
            this.velocidadY = 0;
            this.enSuelo = true;
        }

        // Mecánica existente: si el pollo cae por un hueco del mapa y llega
        // al agua, muere. Con la colisión corregida esto solo ocurre cuando
        // realmente no hay ninguna plataforma debajo.
        if (this.y > 560) {
            this.recibirDanio(100);
        }
    }

    moverIzquierda() {
        this.velocidadX = -this.velocidad;
        this.direccion = -1;
    }

    moverDerecha() {
        this.velocidadX = this.velocidad;
        this.direccion = 1;
    }

    detener() {
        this.velocidadX = 0;
    }

    saltar() {
        if (this.enSuelo) {
            this.velocidadY = -this.fuerzaSalto;
            this.enSuelo = false;
        }
    }

    recibirDanio(danio) {
        if (!this.vivo) return;
        this.vida -= danio;
        if (this.vida <= 0) {
            this.vida = 0;
            this.morir();
        }
    }

    morir() {
        this.vivo = false;
        this.velocidadX = 0;
        this.velocidadY = 0;
        console.log(this.nombre + " ha sido eliminado");
    }

    dibujar(ctx) {
        if (!this.vivo) return;

        this.dibujarVida(ctx);

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radio, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(this.x, this.y - 12, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#000000";
        ctx.fillRect(this.x - 10, this.y + 10, 20, 6);

        this.canon.dibujar(ctx);
    }

    /**
     * Dibuja el nombre y la barra de vida sobre el pollo.
     *
     * La posición se calcula a partir de las coordenadas actuales
     * para que la información acompañe al personaje al moverse.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarVida(ctx) {
        const anchoBarra = 42;
        const altoBarra = 6;
        const porcentaje = Math.max(0, Math.min(1, this.vida / this.vidaMaxima));
        const inicioX = this.x - anchoBarra / 2;
        const posicionBarraY = this.y - this.radio - 24;
        const colorVida = porcentaje > 0.6 ? "#4ddf7d" : porcentaje > 0.3 ? "#ffd166" : "#ff6b6b";

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "10px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(this.nombre, this.x, posicionBarraY - 9);

        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(inicioX, posicionBarraY, anchoBarra, altoBarra);
        ctx.fillStyle = colorVida;
        ctx.fillRect(inicioX, posicionBarraY, anchoBarra * porcentaje, altoBarra);

        ctx.font = "bold 10px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(Math.ceil(this.vida), this.x, posicionBarraY - 1);
        ctx.restore();
    }
} 
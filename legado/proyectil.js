/**
 * Clase Proyectil
 *
 * Representa un proyectil con movimiento parabólico.
 */
class Proyectil {
    constructor(x, y, velocidadX, velocidadY) {
        this.x = x;
        this.y = y;
        this.velocidadX = velocidadX;
        this.velocidadY = velocidadY;
        this.gravedad = 500;
        this.viento = 0;
        this.radio = 6;
        this.activo = true;
    }

    actualizar(delta, juego) {
        if (!this.activo) return;

        this.velocidadX += this.viento * delta * 2.2;
        this.velocidadY += this.gravedad * delta;
        this.x += this.velocidadX * delta;
        this.y += this.velocidadY * delta;

        const impactoTerreno = this.colisionaConTerreno(juego.terreno);
        if (impactoTerreno) {
            this.activo = false;
            juego.generarExplosion(this.x, this.y, 60, "#ffb347");
            return;
        }

        const impactoPersonaje = this.colisionaConPersonajes(juego.pollos, juego.gusanos);
        if (impactoPersonaje) {
            this.activo = false;
            juego.generarExplosion(this.x, this.y, 65, "#ff6b6b");
            return;
        }

        // El límite horizontal depende del ancho real del mundo.
        if (this.x < -50 || this.x > juego.ancho + 50 || this.y > juego.alto + 50) {
            this.activo = false;
        }
    }

    colisionaConTerreno(terreno) {
        return terreno.plataformas.some((plataforma) => {
            const rectX = this.x + this.radio > plataforma.x && this.x - this.radio < plataforma.x + plataforma.ancho;
            const rectY = this.y + this.radio > plataforma.y && this.y - this.radio < plataforma.y + plataforma.alto;
            return rectX && rectY;
        });
    }

    colisionaConPersonajes(pollos, gusanos) {
        const personajes = [...pollos, ...gusanos];
        return personajes.some((personaje) => {
            if (!personaje || !personaje.vivo) return false;
            const distancia = Math.hypot(this.x - personaje.x, this.y - personaje.y);
            return distancia < this.radio + personaje.radio;
        });
    }

    dibujar(ctx) {
        if (!this.activo) return;

        ctx.fillStyle = "#222222";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radio, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#888888";
        ctx.beginPath();
        ctx.arc(this.x - 2, this.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}
/**
 * Clase Canon
 *
 * Controla el ángulo, la potencia y el disparo del personaje.
 */
class Canon {
    constructor(personaje) {
        this.personaje = personaje;
        this.angulo = 30;
        this.longitud = 32;
        this.potenciaMinima = 250;
        this.potenciaMaxima = 620;
        this.potencia = this.potenciaMinima;
        this.cargando = false;
    }

    aumentarAngulo() {
        this.angulo += 2;
        if (this.angulo > 80) this.angulo = 80;
    }

    disminuirAngulo() {
        this.angulo -= 2;
        if (this.angulo < -80) this.angulo = -80;
    }

    iniciarCarga() {
        this.cargando = true;
    }

    cargar(delta) {
        if (!this.cargando) return;
        this.potencia += 280 * delta;
        if (this.potencia > this.potenciaMaxima) {
            this.potencia = this.potenciaMaxima;
        }
    }

    soltarCarga() {
        if (!this.cargando) return null;

        this.cargando = false;
        const proyectil = this.disparar();
        this.potencia = this.potenciaMinima;
        return proyectil;
    }

    disparar() {
        const direccion = this.personaje.direccion || 1;
        const radianes = (this.angulo * Math.PI) / 180;
        const salidaX = this.personaje.x + Math.cos(radianes) * this.longitud * direccion;
        const salidaY = this.personaje.y - Math.sin(radianes) * this.longitud;
        const velocidadX = Math.cos(radianes) * this.potencia * direccion;
        const velocidadY = -Math.sin(radianes) * this.potencia;

        return new Proyectil(salidaX, salidaY, velocidadX, velocidadY);
    }

    dibujar(ctx) {
        const direccion = this.personaje.direccion || 1;
        const radianes = (this.angulo * Math.PI) / 180;
        const finalX = this.personaje.x + Math.cos(radianes) * this.longitud * direccion;
        const finalY = this.personaje.y - Math.sin(radianes) * this.longitud;

        ctx.strokeStyle = "#1b1b1b";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.personaje.x, this.personaje.y);
        ctx.lineTo(finalX, finalY);
        ctx.stroke();
    }
}
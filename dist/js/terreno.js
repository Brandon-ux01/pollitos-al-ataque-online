/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Terreno del cliente (espejo)
 * =========================================================
 *
 * El cliente NO decide física: solo reconstruye exactamente el mismo terreno
 * que simula el servidor para poder dibujarlo.
 *
 * Cómo se mantiene sincronizado, sin enviar la rejilla completa:
 *  1. El servidor envía las plataformas originales y el tamaño de celda en
 *     el paquete "inicio".
 *  2. Con eso el cliente reconstruye la rejilla (misma fórmula exacta).
 *  3. Cada paquete de estado incluye los cráteres NUEVOS; el cliente aplica
 *     el mismo agujero y el terreno sigue coincidiendo con el servidor.
 */

class Terreno {
    /**
     * @param {object} mundo Datos del mundo enviados por el servidor.
     */
    constructor(mundo) {
        this.reconstruir(mundo);
    }

    /**
     * Reconstruye la rejilla completa desde los datos del servidor.
     *
     * @param {object} mundo { ancho, alto, celda, plataformas }.
     */
    reconstruir(mundo) {
        this.ancho = mundo.ancho;
        this.alto = mundo.alto;
        this.celda = mundo.celda;
        this.plataformas = mundo.plataformas;
        this.columnas = Math.ceil(this.ancho / this.celda);
        this.filas = Math.ceil(this.alto / this.celda);
        this.rejilla = new Uint8Array(this.columnas * this.filas);

        this.plataformas.forEach((plataforma) => {
            const columnaInicial = Math.floor(plataforma.x / this.celda);
            const columnaFinal = Math.ceil((plataforma.x + plataforma.ancho) / this.celda) - 1;
            const filaInicial = Math.floor(plataforma.y / this.celda);
            const filaFinal = Math.ceil((plataforma.y + plataforma.alto) / this.celda) - 1;

            for (let columna = columnaInicial; columna <= columnaFinal; columna++) {
                for (let fila = filaInicial; fila <= filaFinal; fila++) {
                    this.marcar(columna, fila, 1);
                }
            }
        });
    }

    /**
     * Escribe una celda si está dentro de los límites de la rejilla.
     */
    marcar(columna, fila, valor) {
        if (columna < 0 || fila < 0 || columna >= this.columnas || fila >= this.filas) {
            return;
        }

        this.rejilla[fila * this.columnas + columna] = valor;
    }

    /**
     * Indica si una celda es sólida.
     */
    esSolido(columna, fila) {
        if (columna < 0 || fila < 0 || columna >= this.columnas || fila >= this.filas) {
            return false;
        }

        return this.rejilla[fila * this.columnas + columna] === 1;
    }

    /**
     * Aplica un cráter igual que el servidor: círculo de celdas a aire.
     *
     * @param {number} x Centro horizontal.
     * @param {number} y Centro vertical.
     * @param {number} radio Radio del cráter.
     */
    aplicarCrater(x, y, radio) {
        const columnaInicial = Math.max(0, Math.floor((x - radio) / this.celda));
        const columnaFinal = Math.min(this.columnas - 1, Math.floor((x + radio) / this.celda));
        const filaInicial = Math.max(0, Math.floor((y - radio) / this.celda));
        const filaFinal = Math.min(this.filas - 1, Math.floor((y + radio) / this.celda));
        const radioAlCuadrado = radio * radio;

        for (let columna = columnaInicial; columna <= columnaFinal; columna++) {
            const centroX = columna * this.celda + this.celda / 2;
            const diferencialX = centroX - x;

            for (let fila = filaInicial; fila <= filaFinal; fila++) {
                const centroY = fila * this.celda + this.celda / 2;
                const diferencialY = centroY - y;

                if (diferencialX * diferencialX + diferencialY * diferencialY <= radioAlCuadrado) {
                    this.marcar(columna, fila, 0);
                }
            }
        }
    }

    /**
     * Valor seudoaleatorio estable por celda: sirve para el texturizado sin
     * guardar nada y sin que el aspecto cambie entre fotogramas.
     *
     * @param {number} columna Columna.
     * @param {number} fila Fila.
     * @returns {number} Valor entre 0 y 1.
     */
    ruido(columna, fila) {
        const valor = Math.sin(columna * 12.9898 + fila * 78.233) * 43758.5453;
        return valor - Math.floor(valor);
    }

    /**
     * Dibuja el terreno por columnas, uniendo celdas contiguas en rectángulos.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujar(ctx) {
        const celda = this.celda;

        ctx.save();

        for (let columna = 0; columna < this.columnas; columna++) {
            let fila = 0;

            while (fila < this.filas) {
                if (!this.esSolido(columna, fila)) {
                    fila += 1;
                    continue;
                }

                let fin = fila;

                while (fin + 1 < this.filas && this.esSolido(columna, fin + 1)) {
                    fin += 1;
                }

                const x = columna * celda;
                const y = fila * celda;
                const altoTramo = (fin - fila + 1) * celda;

                // Cuerpo de tierra (dos tonos para dar textura).
                ctx.fillStyle = this.ruido(columna, fila) > 0.5 ? "#7b5c33" : "#755431";
                ctx.fillRect(x, y, celda, altoTramo);

                // Césped en las celdas con aire encima (superficie visible).
                if (!this.esSolido(columna, fila - 1)) {
                    ctx.fillStyle = "#3f7a46";
                    ctx.fillRect(x, y, celda, Math.min(10, celda + 2));
                    ctx.fillStyle = "#58a25d";
                    ctx.fillRect(x, y, celda, 4);
                }

                // Motas decorativas para dar volumen a la tierra.
                if (this.ruido(columna, fin) > 0.72 && altoTramo > celda * 2) {
                    ctx.fillStyle = "rgba(60, 38, 20, 0.5)";
                    ctx.fillRect(x + 2, y + altoTramo - celda - 4, 4, 4);
                }

                fila = fin + 1;
            }
        }

        ctx.restore();
    }
}


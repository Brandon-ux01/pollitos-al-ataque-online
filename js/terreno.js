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
     * Estilo de dibujo animado, en tres pasadas:
     *  1. Tierra marrón con piedrecitas y césped verde en la superficie.
     *  2. Contorno oscuro alrededor de toda la silueta (el "borde de tinta").
     *  3. Brillo claro en el borde del césped.
     *
     * Los agujeros de las explosiones se ven al momento: los cráteres ya están
     * aplicados en la rejilla (los aplica el servidor y los repite el cliente).
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujar(ctx) {
        const celda = this.celda;

        ctx.save();

        // --- 1. Tierra, césped y piedrecitas ---------------------------------

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

                // Cuerpo de tierra: dos tonos que se alternan para dar textura.
                ctx.fillStyle = this.ruido(columna, fila) > 0.5 ? "#a9662f" : "#9c5c2a";
                ctx.fillRect(x, y, celda, altoTramo);

                // Piedrecitas (solo en tramos hondos, para no llenar la pantalla).
                if (altoTramo > celda * 3) {
                    const grano = this.ruido(columna * 3, fin * 5);

                    if (grano > 0.68) {
                        ctx.fillStyle = "rgba(72, 42, 18, 0.45)";
                        ctx.fillRect(x + 1.5, y + altoTramo - celda * 2 + 2, 3.5, 3.5);
                    }

                    if (grano < 0.18) {
                        ctx.fillStyle = "rgba(255, 226, 176, 0.22)";
                        ctx.fillRect(x + 2, y + altoTramo - celda - 5, 3, 3);
                    }
                }

                // Césped en las celdas con aire encima (superficie visible).
                if (!this.esSolido(columna, fila - 1)) {
                    const hierba = celda + 3;

                    ctx.fillStyle = "#37902c";
                    ctx.fillRect(x, y, celda, hierba);
                    ctx.fillStyle = "#4fbf3d";
                    ctx.fillRect(x, y, celda, hierba - 3);
                    ctx.fillStyle = "#7ee05c";
                    ctx.fillRect(x, y, celda, 3);
                }

                fila = fin + 1;
            }
        }

        // --- 2. Contorno oscuro de la silueta --------------------------------

        ctx.beginPath();

        for (let columna = 0; columna < this.columnas; columna++) {
            for (let fila = 0; fila < this.filas; fila++) {
                if (!this.esSolido(columna, fila)) {
                    continue;
                }

                const x = columna * celda;
                const y = fila * celda;

                // Cara superior.
                if (!this.esSolido(columna, fila - 1)) {
                    ctx.moveTo(x, y + 1.5);
                    ctx.lineTo(x + celda, y + 1.5);
                }

                // Cara inferior (bloques que quedan colgando).
                if (!this.esSolido(columna, fila + 1)) {
                    ctx.moveTo(x, y + celda - 1.5);
                    ctx.lineTo(x + celda, y + celda - 1.5);
                }

                // Cara izquierda.
                if (!this.esSolido(columna - 1, fila)) {
                    ctx.moveTo(x + 1.5, y);
                    ctx.lineTo(x + 1.5, y + celda);
                }

                // Cara derecha.
                if (!this.esSolido(columna + 1, fila)) {
                    ctx.moveTo(x + celda - 1.5, y);
                    ctx.lineTo(x + celda - 1.5, y + celda);
                }
            }
        }

        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(24, 40, 26, 0.75)";
        ctx.stroke();

        ctx.restore();
    }
}


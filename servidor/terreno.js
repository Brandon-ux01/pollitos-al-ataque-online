/**
 * =========================================================
 * Terreno destruible del servidor (autoridad de la partida)
 * =========================================================
 *
 * El mapa original se construía con una lista de plataformas rectangulares
 * y la colisión se resolvía buscando "la plataforma más alta bajo los pies".
 *
 * Aquí se conserva ese mismo mapa, pero se rasteriza en una rejilla de
 * celdas cuadradas. Así el terreno puede PERFORARSE realmente: cada
 * explosión borra las celdas que alcanza su radio y las grietas resultantes
 * afectan a la física, porque la colisión se resuelve contra la rejilla.
 *
 * El cliente reconstruye exactamente la misma rejilla (ver js/terreno.js)
 * a partir de las plataformas y de la lista de cráteres que envía el
 * servidor, de modo que ambos lados coinciden sin enviar la rejilla entera.
 */

const CONFIG = require("./config");

class Terreno {
    /**
     * @param {Array} plataformas Lista de rectángulos del mapa.
     * @param {number} celda Tamaño de celda en píxeles.
     */
    constructor(plataformas = CONFIG.PLATAFORMAS, celda = CONFIG.CELDA) {
        this.ancho = CONFIG.ANCHO;
        this.alto = CONFIG.ALTO;
        this.celda = celda;
        this.columnas = Math.ceil(this.ancho / celda);
        this.filas = Math.ceil(this.alto / celda);
        this.plataformas = plataformas;
        this.rejilla = new Uint8Array(this.columnas * this.filas);
        this.reconstruir();
    }

    /**
     * Vuelve a generar la rejilla completa desde las plataformas originales.
     * Se usa al crear la partida y al reiniciarla (los cráteres se borran).
     */
    reconstruir() {
        this.rejilla.fill(0);

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
     *
     * @param {number} columna Índice de columna.
     * @param {number} fila Índice de fila.
     * @param {number} valor 1 = sólido, 0 = aire.
     */
    marcar(columna, fila, valor) {
        if (columna < 0 || fila < 0 || columna >= this.columnas || fila >= this.filas) {
            return;
        }

        this.rejilla[fila * this.columnas + columna] = valor;
    }

    /**
     * Indica si una celda concreta es sólida.
     */
    esSolido(columna, fila) {
        if (columna < 0 || fila < 0 || columna >= this.columnas || fila >= this.filas) {
            return false;
        }

        return this.rejilla[fila * this.columnas + columna] === 1;
    }

    /**
     * Indica si un punto del mundo (coordenadas de pantalla) es sólido.
     */
    esSolidoEn(x, y) {
        return this.esSolido(Math.floor(x / this.celda), Math.floor(y / this.celda));
    }

    /**
     * Excava un cráter circular en el terreno.
     *
     * @param {number} x Centro horizontal del cráter.
     * @param {number} y Centro vertical del cráter.
     * @param {number} radio Radio del cráter en píxeles.
     * @returns {boolean} true si al menos una celda dejó de ser sólida.
     */
    excavar(x, y, radio) {
        const columnaInicial = Math.max(0, Math.floor((x - radio) / this.celda));
        const columnaFinal = Math.min(this.columnas - 1, Math.floor((x + radio) / this.celda));
        const filaInicial = Math.max(0, Math.floor((y - radio) / this.celda));
        const filaFinal = Math.min(this.filas - 1, Math.floor((y + radio) / this.celda));

        const radioAlCuadrado = radio * radio;
        let cambio = false;

        for (let columna = columnaInicial; columna <= columnaFinal; columna++) {
            const centroX = columna * this.celda + this.celda / 2;
            const diferencialX = centroX - x;

            for (let fila = filaInicial; fila <= filaFinal; fila++) {
                if (this.rejilla[fila * this.columnas + columna] !== 1) {
                    continue;
                }

                const centroY = fila * this.celda + this.celda / 2;
                const diferencialY = centroY - y;

                if (diferencialX * diferencialX + diferencialY * diferencialY <= radioAlCuadrado) {
                    this.rejilla[fila * this.columnas + columna] = 0;
                    cambio = true;
                }
            }
        }

        return cambio;
    }

    /**
     * Busca la primera superficie sólida bajo un punto.
     *
     * Se revisa la columna de la posición X desde una fila superior
     * (margenArriba) hasta una inferior (margenAbajo). Es el equivalente
     * con rejilla de la comprobación "plataforma.y .. plataforma.y + 25"
     * del juego original.
     *
     * @param {number} x Coordenada horizontal a revisar.
     * @param {number} pies Coordenada vertical de los pies.
     * @param {number} margenArriba Píxeles por encima de los pies a revisar.
     * @param {number} margenAbajo Píxeles por debajo de los pies a revisar.
     * @returns {number|null} Coordenada Y de la superficie o null si no hay suelo.
     */
    buscarSuperficie(x, pies, margenArriba = 2, margenAbajo = 4) {
        const columna = Math.floor(x / this.celda);

        if (columna < 0 || columna >= this.columnas) {
            return null;
        }

        const filaInicial = Math.max(0, Math.floor((pies - margenArriba) / this.celda));
        const filaFinal = Math.min(this.filas - 1, Math.floor((pies + margenAbajo) / this.celda));

        for (let fila = filaInicial; fila <= filaFinal; fila++) {
            if (this.esSolido(columna, fila)) {
                return fila * this.celda;
            }
        }

        return null;
    }

    /**
     * Devuelve la cima de la columna de terreno a partir de una altura dada.
     *
     * Se utiliza para subir escalones: si el borde del bloque que bloquea el
     * paso está a menos de ALTURA_ESCALON píxeles por encima de los pies, el
     * personaje sube a él en lugar de quedar detenido (mismo comportamiento
     * que el original al caminar sobre las plataformas de 25 px).
     *
     * @param {number} x Coordenada horizontal.
     * @param {number} desdeY Altura desde la que se empieza a buscar hacia abajo.
     * @param {number} distancia Máxima distancia a buscar hacia abajo.
     * @returns {number|null} Y de la superficie encontrada.
     */
    cimaColumna(x, desdeY, distancia) {
        const columna = Math.floor(x / this.celda);

        if (columna < 0 || columna >= this.columnas) {
            return null;
        }

        const filaInicial = Math.max(0, Math.floor(desdeY / this.celda));
        const filaFinal = Math.min(this.filas - 1, Math.floor((desdeY + distancia) / this.celda));

        for (let fila = filaInicial; fila <= filaFinal; fila++) {
            if (this.esSolido(columna, fila)) {
                return fila * this.celda;
            }
        }

        return null;
    }

    /**
     * Comprueba si el cuerpo de un personaje choca con el terreno.
     *
     * El cuerpo se aproxima con nueve puntos (tres columnas por tres
     * alturas), suficiente con celdas de 8 px y un radio de 17 px.
     *
     * @param {number} x Centro del personaje.
     * @param {number} y Centro del personaje.
     * @returns {boolean} true si el cuerpo atraviesa terreno sólido.
     */
    colisionaCuerpo(x, y) {
        const radio = CONFIG.RADIO_PERSONAJE;
        const mediaAnchura = radio * 0.7;
        const arriba = y - radio + 3;
        const abajo = y + radio - 3;

        const puntosX = [x - mediaAnchura, x, x + mediaAnchura];
        const puntosY = [arriba, y, abajo];

        for (let i = 0; i < puntosX.length; i++) {
            for (let j = 0; j < puntosY.length; j++) {
                if (this.esSolidoEn(puntosX[i], puntosY[j])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Serializa únicamente los datos que necesita el cliente:
     * las plataformas originales y el tamaño de celda.
     */
    serializar() {
        return {
            ancho: this.ancho,
            alto: this.alto,
            celda: this.celda,
            plataformas: this.plataformas
        };
    }
}

module.exports = Terreno;

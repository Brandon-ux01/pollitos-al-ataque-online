/**
 * =========================================================
 * POLLITOS AL ATAQUE ONLINE - Escenario de fondo
 * =========================================================
 *
 * Dibuja el ambiente con la estética del arte del juego: cielo de día muy
 * claro, sol con rayos, nubes, montañas y mar. Los dibujos de
 * assets/imagenes/escenarios/cancha/ se colocan como decoración (árboles,
 * arbustos, rocas y agaves) y, al fondo, plataformas flotantes lejanas.
 *
 * Capas, de atrás hacia delante:
 *  1. Cielo con degradado, rayos y sol.
 *  2. Nubes con movimiento lento (paralaje).
 *  3. Plataformas lejanas y montañas.
 *  4. Mar al pie del mapa, con olas animadas.
 *  5. Decoración (árboles, arbustos, rocas) apoyada en las plataformas.
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
            y: 30 + Math.random() * 150,
            escala: 0.7 + Math.random() * 0.9,
            velocidad: 4 + Math.random() * 9,
            opacidad: 0.75 + Math.random() * 0.25
        }));

        // Colinas lejanas: dos capas de siluetas suaves.
        this.colinas = [
            this.crearColina(90, 18, 0.55),
            this.crearColina(150, 26, 0.8)
        ];

        /**
         * Plataformas flotantes del fondo (solo decoración: no se pisa).
         * Cada una: dibujo, x, y (borde superior), alto y espejo.
         */
        this.plataformasLejanas = [
            { recurso: "escenarios/cancha/plataforma_larga", x: 120, y: 150, alto: 58, espejo: 1 },
            { recurso: "escenarios/cancha/plataforma_corta", x: 420, y: 96, alto: 52, espejo: -1 },
            { recurso: "escenarios/cancha/plataforma_media", x: 720, y: 132, alto: 54, espejo: 1 },
            { recurso: "escenarios/cancha/plataforma_rocosa", x: 1010, y: 176, alto: 50, espejo: -1 }
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
     * Dibuja los planos de cielo, rayos, sol, nubes y colinas.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarCielo(ctx) {
        const gradiente = ctx.createLinearGradient(0, 0, 0, this.alto);
        gradiente.addColorStop(0, "#3aa8e8");
        gradiente.addColorStop(0.45, "#6ec9f5");
        gradiente.addColorStop(1, "#c8eeff");
        ctx.fillStyle = gradiente;
        ctx.fillRect(0, 0, this.ancho, this.alto);

        const solX = 940;
        const solY = 96;

        // Rayos del sol girando muy despacio (el fondo del menú también los
        // tiene: así la partida y el menú parecen el mismo juego).
        ctx.save();
        ctx.translate(solX, solY);
        ctx.rotate(this.tiempo * 0.045);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#fff6c9";

        for (let indice = 0; indice < 12; indice++) {
            ctx.rotate((Math.PI * 2) / 12);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(600, -46);
            ctx.lineTo(600, 46);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // Sol con halo y borde de dibujos animados.
        const halo = ctx.createRadialGradient(solX, solY, 8, solX, solY, 130);
        halo.addColorStop(0, "rgba(255, 246, 201, 0.95)");
        halo.addColorStop(0.4, "rgba(255, 220, 130, 0.45)");
        halo.addColorStop(1, "rgba(255, 220, 130, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(solX, solY, 130, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffe066";
        ctx.beginPath();
        ctx.arc(solX, solY, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff3b0";
        ctx.beginPath();
        ctx.arc(solX, solY, 30, 0, Math.PI * 2);
        ctx.fill();

        // Nubes esponjosas con borde suave.
        this.nubes.forEach((nube) => {
            ctx.save();
            ctx.globalAlpha = nube.opacidad;
            ctx.translate(nube.x, nube.y);
            ctx.scale(nube.escala, nube.escala * 0.8);

            const forma = () => {
                ctx.beginPath();
                ctx.arc(0, 0, 26, 0, Math.PI * 2);
                ctx.arc(28, 6, 20, 0, Math.PI * 2);
                ctx.arc(-28, 8, 18, 0, Math.PI * 2);
                ctx.arc(6, -14, 20, 0, Math.PI * 2);
                ctx.fill();
            };

            ctx.fillStyle = "rgba(150, 205, 240, 0.55)";
            ctx.save();
            ctx.translate(2, 4);
            forma();
            ctx.restore();

            ctx.fillStyle = "#ffffff";
            forma();
            ctx.restore();
        });

        // Colinas.
        this.colinas.forEach((capa, indice) => {
            ctx.save();
            ctx.globalAlpha = capa.opacidad;
            ctx.fillStyle = indice === 0 ? "#7fd48a" : "#4fae63";
            ctx.beginPath();
            ctx.moveTo(capa.puntos[0].x, this.alto);

            capa.puntos.forEach((punto) => ctx.lineTo(punto.x, punto.y));

            ctx.lineTo(capa.puntos[capa.puntos.length - 1].x, this.alto);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // Plataformas lejanas (decoración del fondo: no se pisan). Se dibujan
        // delante de las colinas para que se vean recortadas contra el cielo.
        ctx.save();
        ctx.globalAlpha = 0.6;

        this.plataformasLejanas.forEach((plataforma) => {
            const imagen = Recursos.imagen(plataforma.recurso);

            Recursos.dibujarAjustado(ctx, imagen, plataforma.x, plataforma.y, plataforma.alto, plataforma.espejo);
        });

        ctx.restore();
    }

    /**
     * Dibuja el mar por delante del terreno, con olas animadas.
     *
     * Agua clara de dibujos animados: azul con franjas, cresta de espuma blanca
     * y un reborde oscuro para separarla del terreno.
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     */
    dibujarMar(ctx) {
        const ola = (x) => this.nivelMar + Math.sin(x * 0.05 + this.tiempo * 2.2) * 4 +
            Math.sin(x * 0.013 + this.tiempo) * 3;

        ctx.save();

        ctx.beginPath();
        ctx.moveTo(0, ola(0));

        for (let x = 0; x <= this.ancho; x += 30) {
            ctx.lineTo(x, ola(x));
        }

        ctx.lineTo(this.ancho, this.alto);
        ctx.lineTo(0, this.alto);
        ctx.closePath();

        const gradiente = ctx.createLinearGradient(0, this.nivelMar, 0, this.alto);
        gradiente.addColorStop(0, "rgba(66, 175, 235, 0.9)");
        gradiente.addColorStop(0.5, "rgba(38, 135, 205, 0.95)");
        gradiente.addColorStop(1, "rgba(20, 92, 160, 0.98)");
        ctx.fillStyle = gradiente;
        ctx.fill();

        // Franjas del agua (líneas claras que siguen el oleaje).
        ctx.strokeStyle = "rgba(190, 235, 255, 0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();

        for (let franja = 0; franja < 4; franja++) {
            const altura = this.nivelMar + 14 + franja * 16;

            for (let x = 0; x <= this.ancho; x += 24) {
                const y = altura + Math.sin(x * 0.04 + this.tiempo * 2 + franja) * 3;

                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }

        ctx.stroke();

        // Cresta de espuma.
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 4;
        ctx.beginPath();

        for (let x = 0; x <= this.ancho; x += 20) {
            const y = ola(x);

            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Reborde oscuro justo debajo de la espuma.
        ctx.strokeStyle = "rgba(12, 70, 120, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let x = 0; x <= this.ancho; x += 20) {
            const y = ola(x) + 5;

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
     * Valor estable (0..1) a partir de dos números.
     *
     * Sirve para repartir la decoración siempre igual: con Math.random los
     * árboles cambiarían de sitio en cada fotograma.
     *
     * @param {number} a Primer número.
     * @param {number} b Segundo número.
     * @returns {number} Valor entre 0 y 1.
     */
    mezcla(a, b) {
        const valor = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
        return valor - Math.floor(valor);
    }

    /**
     * Dibuja decoración apoyada en el terreno con los dibujos originales
     * (árboles, arbustos, rocas, agave y piedras).
     *
     * Sobre las plataformas gruesas se pone un árbol en un extremo y un detalle
     * menudo en el otro; sobre las finas, solo el detalle. Si una explosión ha
     * volado esa parte del terreno, el adorno desaparece (nada de árboles
     * flotando en el aire).
     *
     * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
     * @param {Array} plataformas Plataformas del mundo.
     * @param {Terreno} terreno Terreno del cliente (opcional).
     */
    dibujarDecoracion(ctx, plataformas, terreno) {
        const arboles = [
            "escenarios/cancha/pino",
            "escenarios/cancha/pino_alto",
            "escenarios/cancha/arbol"
        ];
        const menudos = [
            "escenarios/cancha/arbusto_alto",
            "escenarios/cancha/arbusto_redondo",
            "escenarios/cancha/arbusto_ancho",
            "escenarios/cancha/agave",
            "escenarios/cancha/roca_grande",
            "escenarios/cancha/roca_media",
            "escenarios/cancha/roca_alta",
            "escenarios/cancha/piedras"
        ];

        /** ¿Sigue habiendo suelo justo debajo del adorno? */
        const haySuelo = (x, y) => {
            if (!terreno) {
                return true;
            }

            return terreno.esSolido(
                Math.floor(x / terreno.celda),
                Math.floor((y + 6) / terreno.celda)
            );
        };

        const elegir = (lista, indice, sal) => lista[Math.floor(this.mezcla(indice, sal) * lista.length) % lista.length];

        ctx.save();

        plataformas.forEach((plataforma, indice) => {
            const base = plataforma.y + 2;
            const gruesa = plataforma.alto >= 24;

            // --- Árbol en un extremo de las plataformas anchas ---------------
            if (gruesa && plataforma.ancho >= 150) {
                const haciaDerecha = this.mezcla(indice, 3.7) > 0.5;
                const xArbol = haciaDerecha ? plataforma.x + plataforma.ancho - 34 : plataforma.x + 34;

                if (haySuelo(xArbol, base)) {
                    const alto = 94 + this.mezcla(indice, 7.1) * 36;

                    Recursos.dibujarAjustado(
                        ctx,
                        Recursos.imagen(elegir(arboles, indice, 11.3)),
                        xArbol,
                        base,
                        alto,
                        haciaDerecha ? -1 : 1
                    );
                }
            }

            // --- Detalle menudo (arbusto, roca, agave...) --------------------
            const recursoMenudo = elegir(menudos, indice, 5.9);
            const esRoca = recursoMenudo.indexOf("roca") >= 0 || recursoMenudo.indexOf("piedras") >= 0;
            const desplazamiento = (this.mezcla(indice, 9.4) - 0.5) * Math.min(70, plataforma.ancho * 0.35);
            const xMenudo = plataforma.x + plataforma.ancho / 2 + desplazamiento;

            if (haySuelo(xMenudo, base)) {
                Recursos.dibujarAjustado(
                    ctx,
                    Recursos.imagen(recursoMenudo),
                    xMenudo,
                    base,
                    (esRoca ? 32 : 44) + this.mezcla(indice, 2.3) * (esRoca ? 22 : 16),
                    this.mezcla(indice, 4.4) > 0.5 ? 1 : -1
                );
            }
        });

        ctx.restore();
    }
}


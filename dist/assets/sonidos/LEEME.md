# 🎵 SONIDOS - POLLITOS AL ATAQUE

Aquí viven **todos** los archivos de audio del juego. Las rutas están declaradas
en un solo lugar: `js/configuracion/configuracion_sonido.js`.

Los archivos pueden estar en `.mp3`, `.wav` u `.ogg`: el juego prueba las tres
extensiones automáticamente (en ese orden). No es necesario convertir nada.

> No hay ningún archivo de audio subido todavía. El juego funciona igual:
> si falta un sonido, avisa una vez por consola y continúa.

---

## 📂 Estructura y contenido

```
assets/sonidos/
├── musica/
│   ├── menu/         → música del menú principal
│   ├── batalla/      → música general de las batallas
│   └── escenarios/   → una música por escenario (opcional)
└── efectos/
    ├── jugadores/    → sonidos de los jugadores
    ├── armas/        → disparos y explosiones
    ├── interfaz/     → botones y elementos de interfaz
    └── partida/      → inicio y final de partida
```

---

## 🎼 MÚSICA

| Archivo | Carpeta | Cuándo suena |
|---|---|---|
| `fondo_de_menu_principal.*` | `musica/menu/` | Menú, sala de espera, opciones y créditos |
| `fondo_de_la_batalla.*` | `musica/batalla/` | Durante toda la partida |
| `escenario_1.*` | `musica/escenarios/` | Partida en el escenario 1 |
| `escenario_2.*` | `musica/escenarios/` | Partida en el escenario 2 |
| `escenario_3.*` | `musica/escenarios/` | Partida en el escenario 3 |
| `escenario_4.*` | `musica/escenarios/` | Partida en el escenario 4 |

Si el escenario no tiene música todavía, se usa `fondo_de_la_batalla`: la
partida nunca se queda en silencio.

---

## 🔊 EFECTOS

| Archivo | Carpeta | Cuándo suena |
|---|---|---|
| `cambio_de_jugador.*` | `efectos/jugadores/` | Al empezar el turno de un jugador |
| `disparo_de_cañón.*` | `efectos/armas/` | Al disparar (una vez por disparo) |
| `explosion.*` | `efectos/armas/` | En cada explosión |
| `seleccionar_boton_menu.*` | `efectos/interfaz/` | Al pulsar cualquier botón |
| `game over.*` | `efectos/partida/` | Al terminar la partida (victoria o derrota) |

> El archivo `game over` lleva un espacio en el nombre porque así se conserva el
> original. Si prefieres renombrarlo a `game_over`, solo hay que cambiarlo en
> `js/configuracion/configuracion_sonido.js` (una línea).

---

## 🧩 Efectos preparados (sin archivo todavía)

Estos eventos ya están conectados en el código y solo esperan su archivo. Para
activarlos, sustituye el `null` por la ruta en `configuracion_sonido.js`:

| Evento | Archivo sugerido | Carpeta |
|---|---|---|
| `conexion` | `entrada_de_jugador.*` | `efectos/jugadores/` |
| `desconexion` | `salida_de_jugador.*` | `efectos/jugadores/` |
| `salto` | `salto_de_pollito.*` | `efectos/jugadores/` |
| `paso` | `pasos.*` | `efectos/jugadores/` |
| `danio` | `danio_recibido.*` | `efectos/jugadores/` |
| `muerte` | `muerte_de_jugador.*` | `efectos/jugadores/` |
| `impacto` | `impacto_de_proyectil.*` | `efectos/armas/` |
| `inicioPartida` | `inicio_de_partida.*` | `efectos/partida/` |
| `cuentaAtras` | `cuenta_atras.*` | `efectos/partida/` |
| `victoria` | `victoria.*` | `efectos/partida/` |
| `derrota` | `derrota.*` | `efectos/partida/` |

Los nombres son sugerencias, no obligaciones: la ruta real se escribe en la
configuración.

---

## ✅ Comprobar los archivos

```
npm run sonidos
```

Muestra qué archivos encuentra, cuáles faltan y cuáles no están declarados.

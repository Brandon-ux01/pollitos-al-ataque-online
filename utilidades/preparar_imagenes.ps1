# =========================================================
# POLLITOS AL ATAQUE ONLINE - Preparación de las imágenes
# =========================================================
#
# Toma las hojas de dibujos originales (una sola imagen con muchos
# dibujos dentro) y escribe cada dibujo como un PNG individual y
# transparente dentro de assets/imagenes/.
#
# El juego NUNCA usa las hojas completas: solo estos recortes.
#
# Uso (desde la raíz del proyecto):
#   powershell -ExecutionPolicy Bypass -File utilidades\preparar_imagenes.ps1
#
# Parámetros opcionales:
#   -Origen "C:\ruta\con\las\hojas"
#   -Solo  "personajes"   (recorta solo una parte: personajes, interfaz, escenarios, resultados)
#
# Al terminar escribe también una hoja de verificación en la raíz del
# proyecto (_verificacion_personajes.png) con los fotogramas elegidos de
# cada pollito, para comprobar de un vistazo que no falta ningún gorro.
#
# Requisitos: Windows con .NET (System.Drawing). No necesita Node ni npm.
# =========================================================

param(
    # Carpeta con las hojas de dibujos originales.
    [Alias("Origen")]
    [string]$CarpetaOrigen = "C:\Users\Usuario\Desktop\musica de juego\imagenes dle juego",

    # Recorta solo una parte: personajes, interfaz, escenarios o resultados.
    [string]$Solo = ""
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$Raiz = Split-Path -Parent $PSScriptRoot
$Destino = Join-Path $Raiz "assets\imagenes"
$Verificacion = Join-Path $Raiz "_verificacion_personajes.png"

if (-not (Test-Path -LiteralPath $CarpetaOrigen)) {
    throw "No se encontró la carpeta de dibujos originales: $CarpetaOrigen"
}

# ---------------------------------------------------------
# 0. Utilidades
# ---------------------------------------------------------

$Escritas = New-Object System.Collections.Generic.List[string]

function Nueva-Carpeta([string]$ruta) {
    if (-not (Test-Path -LiteralPath $ruta)) {
        New-Item -ItemType Directory -Path $ruta -Force | Out-Null
    }
}

function Obtener-Bitmap([string]$archivo) {
    $ruta = Join-Path $script:CarpetaOrigen $archivo

    if (-not (Test-Path -LiteralPath $ruta)) {
        throw "No existe la hoja original: $ruta"
    }

    return [System.Drawing.Bitmap]::FromFile($ruta)
}

<#
    Recorta un rectángulo de una hoja y lo guarda como PNG con transparencia.

    @param   $hoja     Nombre del archivo de la hoja original.
    @param   $x        Coordenada horizontal del recorte.
    @param   $y        Coordenada vertical del recorte.
    @param   $ancho    Ancho del recorte en píxeles.
    @param   $alto     Alto del recorte en píxeles.
    @param   $salida   Ruta relativa dentro de assets/imagenes.
    @returns Nada.
#>
function Recortar([string]$hoja, [int]$x, [int]$y, [int]$ancho, [int]$alto, [string]$salida) {
    $bitmap = Obtener-Bitmap $hoja

    try {
        $rectangulo = New-Object System.Drawing.Rectangle($x, $y, $ancho, $alto)
        $recorte = $bitmap.Clone($rectangulo, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $rutaSalida = Join-Path $Destino $salida

        Nueva-Carpeta (Split-Path -Parent $rutaSalida)
        $recorte.Save($rutaSalida, [System.Drawing.Imaging.ImageFormat]::Png)
        $recorte.Dispose()

        $Escritas.Add($salida)
    } finally {
        $bitmap.Dispose()
    }
}

# ---------------------------------------------------------
# 1. Botones, armas y paneles (hojas de interfaz)
# ---------------------------------------------------------
#
# Cada fila es: hoja, x, y, ancho, alto y nombre de salida.
# Las coordenadas salen de analizar las hojas originales (detección de
# dibujos con fondo transparente).

$Interfaz = @(
    # --- botones.png: JUGAR / LOBBY / OPCIONES / SALIR / ESPERA + 2 iconos ---
    @("botones.png", 25, 22, 303, 95, "interfaz\botones\jugar.png"),
    @("botones.png", 357, 23, 300, 90, "interfaz\botones\lobby.png"),
    @("botones.png", 26, 139, 302, 92, "interfaz\botones\opciones.png"),
    @("botones.png", 357, 139, 300, 91, "interfaz\botones\salir.png"),
    @("botones.png", 25, 259, 303, 90, "interfaz\botones\espera.png"),
    @("botones.png", 358, 260, 86, 87, "interfaz\botones\icono_sonido.png"),
    @("botones.png", 461, 260, 87, 87, "interfaz\botones\icono_barrera.png"),

    # --- cañones.png: bazuca militar y cañón ornamentado ---
    @("cañones.png", 28, 36, 292, 258, "interfaz\armas\bazuca.png"),
    @("cañones.png", 27, 357, 287, 246, "interfaz\armas\canon.png"),

    # --- recursos_pars_unirse_a_sala.png: paneles del HUD ---
    @("recursos_pars_unirse_a_sala.png", 3, 0, 368, 98, "interfaz\hud\tarjeta_turno.png"),
    @("recursos_pars_unirse_a_sala.png", 393, 10, 68, 67, "interfaz\hud\chip_avatar.png"),
    @("recursos_pars_unirse_a_sala.png", 466, 23, 185, 43, "interfaz\hud\barra_nombres.png"),
    @("recursos_pars_unirse_a_sala.png", 0, 118, 376, 235, "interfaz\hud\panel_jugadores.png"),
    @("recursos_pars_unirse_a_sala.png", 378, 118, 329, 235, "interfaz\hud\panel_lobby.png")
)

# ---------------------------------------------------------
# 2. Escenario del combate (plataformas, árboles, arbustos y rocas)
# ---------------------------------------------------------

$Escenarios = @(
    @("recursos_para_cancha_de_combate.png", 10, 151, 336, 76, "escenarios\cancha\plataforma_larga.png"),
    @("recursos_para_cancha_de_combate.png", 179, 52, 165, 85, "escenarios\cancha\plataforma_media.png"),
    @("recursos_para_cancha_de_combate.png", 158, 259, 181, 73, "escenarios\cancha\plataforma_baja.png"),
    @("recursos_para_cancha_de_combate.png", 11, 52, 129, 82, "escenarios\cancha\plataforma_corta.png"),
    @("recursos_para_cancha_de_combate.png", 17, 251, 108, 91, "escenarios\cancha\plataforma_rocosa.png"),
    @("recursos_para_cancha_de_combate.png", 362, 46, 88, 131, "escenarios\cancha\pino.png"),
    @("recursos_para_cancha_de_combate.png", 462, 45, 88, 132, "escenarios\cancha\pino_alto.png"),
    @("recursos_para_cancha_de_combate.png", 566, 48, 111, 129, "escenarios\cancha\arbol.png"),
    @("recursos_para_cancha_de_combate.png", 367, 196, 78, 50, "escenarios\cancha\arbusto_alto.png"),
    @("recursos_para_cancha_de_combate.png", 534, 196, 73, 48, "escenarios\cancha\arbusto_redondo.png"),
    @("recursos_para_cancha_de_combate.png", 614, 190, 68, 53, "escenarios\cancha\arbusto_ancho.png"),
    @("recursos_para_cancha_de_combate.png", 467, 207, 48, 37, "escenarios\cancha\agave.png"),
    @("recursos_para_cancha_de_combate.png", 367, 266, 100, 74, "escenarios\cancha\roca_grande.png"),
    @("recursos_para_cancha_de_combate.png", 487, 295, 60, 39, "escenarios\cancha\roca_media.png"),
    @("recursos_para_cancha_de_combate.png", 610, 272, 71, 52, "escenarios\cancha\roca_alta.png"),
    @("recursos_para_cancha_de_combate.png", 569, 284, 42, 23, "escenarios\cancha\piedras.png"),

    # Fondo del menú (una sola pieza: la imagen completa).
    @("fondo_de_menu.png", 9, 12, 641, 351, "escenarios\fondo_menu.png")
)

# ---------------------------------------------------------
# 3. Resultados de la partida (victoria y derrota)
# ---------------------------------------------------------
#
# victoria_o_derrota.png trae las dos palabras en la misma lámina:
# "VICTORY" arriba y "DEFEAT" debajo, sobre un fondo con rayos.

$Resultados = @(
    @("victoria_o_derrota.png", 14, 14, 619, 138, "interfaz\resultados\victoria.png", 1),
    @("victoria_o_derrota.png", 14, 152, 619, 217, "interfaz\resultados\derrota.png", 1)
)

# ---------------------------------------------------------
# 4. Pollitos (hojas de 4 columnas x 5 filas = 20 fotogramas)
# ---------------------------------------------------------
#
# Cada hoja trae el mismo pollito repetido en 20 poses distintas. Las
# poses de la última fila son las de golpe y de pollito caído.
#
# "recortes" viene en orden de rejilla: fila por fila y, en cada fila, de
# izquierda a derecha. El índice de un fotograma es fila * 4 + columna.
#
# Las coordenadas son el rectángulo ajustado de cada dibujo dentro de la
# hoja original (así el pollito queda centrado y sin margen de sobra).

$Personajes = @(
    @{
        clave = "0_amarillo"
        nombre = "Pollo amarillo"
        hoja = "pollo_amarillo_3.png"
        recortes = @(
            "18,55,68,93", "118,53,68,95", "217,56,67,92", "315,64,67,84",
            "18,166,67,92", "119,166,67,92", "218,168,67,90", "315,175,67,84",
            "18,279,67,92", "114,278,72,92", "212,279,80,92", "310,289,70,82",
            "17,395,68,91", "117,395,77,92", "216,396,79,90", "314,398,76,88",
            "14,511,81,88", "113,514,80,85", "216,520,73,78", "315,530,70,69"
        )
    },
    @{
        clave = "1_lentes"
        nombre = "Pollo con lentes"
        hoja = "pollo_amarillo_con_lentes.png"
        recortes = @(
            "15,54,69,95", "115,55,69,94", "216,55,70,94", "317,57,69,91",
            "15,168,69,93", "116,168,68,93", "216,168,69,93", "317,170,69,91",
            "16,283,68,93", "115,283,69,92", "212,283,83,92", "314,288,71,87",
            "12,399,82,94", "114,402,78,92", "213,402,83,92", "315,404,81,90",
            "10,515,84,93", "111,518,82,90", "215,524,74,83", "315,533,74,74"
        )
    },
    @{
        clave = "2_chaleco"
        nombre = "Pollo con chaleco"
        hoja = "pollo_con_chaleco.png"
        recortes = @(
            "19,52,69,97", "119,52,69,97", "219,52,67,97", "318,53,67,96",
            "20,165,67,95", "120,165,68,96", "219,165,67,95", "319,166,67,95",
            "19,280,66,95", "119,279,69,95", "217,281,76,93", "317,281,65,93",
            "18,396,80,95", "119,395,77,96", "218,394,76,98", "315,397,81,94",
            "19,513,68,92", "118,516,67,89", "216,524,71,81", "317,521,71,84"
        )
    },
    @{
        clave = "3_morado"
        nombre = "Pollo morado"
        hoja = "pollo_morado.png"
        recortes = @(
            "6,50,80,98", "106,49,80,99", "207,50,77,98", "309,52,75,96",
            "5,163,80,98", "108,163,78,97", "207,163,77,97", "309,165,76,95",
            "6,275,79,99", "106,274,87,100", "214,276,81,97", "309,280,73,94",
            "6,392,85,99", "106,392,88,99", "215,393,79,98", "309,395,89,95",
            "5,508,82,96", "106,511,82,93", "213,521,81,83", "309,533,79,71"
        )
    },
    @{
        clave = "4_naranja"
        nombre = "Pollo naranja"
        hoja = "pollo_naranja.png"
        recortes = @(
            "16,48,68,101", "116,46,69,102", "215,47,70,102", "315,50,69,98",
            "15,164,69,96", "115,161,70,99", "214,162,80,98", "312,164,80,96",
            "16,276,68,100", "115,273,69,102", "211,275,82,99", "311,278,70,95",
            "14,392,75,98", "112,390,82,100", "211,391,85,101", "313,394,84,98",
            "10,507,80,99", "112,505,77,100", "213,512,74,93", "314,524,73,81"
        )
    },
    @{
        clave = "5_verde"
        nombre = "Pollo verde"
        hoja = "pollo_verde.png"
        recortes = @(
            "17,57,70,90", "117,57,69,91", "215,56,69,92", "315,56,68,92",
            "17,169,70,89", "117,169,70,90", "215,169,69,89", "314,170,69,89",
            "17,283,70,90", "117,283,69,89", "212,280,80,91", "312,284,70,88",
            "17,397,79,91", "116,397,78,91", "215,399,78,90", "313,401,80,88",
            "17,513,70,88", "116,515,70,86", "214,520,72,81", "314,525,71,75"
        )
    }
)

# ---------------------------------------------------------
# 5. Qué fotograma se usa para cada estado del juego
# ---------------------------------------------------------
#
# El índice es la posición en la rejilla (fila * 4 + columna).
# Si algún pollito se ve raro (por ejemplo si le cambia el sombrero entre
# dos poses), cambia estos números y vuelve a ejecutar el script.

$Fotogramas = [ordered]@{
    quieto  = 0   # de pie, mirando al frente
    caminar = 1   # de pie con una ligera inclinación (alterna con quieto)
    salto   = 3   # de pie con el cuerpo estirado
    disparo = 14  # ala extendida hacia delante (retroceso del cañón)
    danio   = 18  # golpe recibido: cabeza inflada
    muerto  = 19  # pollito caído en el suelo
}

# Excepciones: si un pollito necesita otros fotogramas, se añaden aquí.
# Ejemplo: $FotogramasPorPersonaje["0_amarillo"] = @{ disparo = 10 }
$FotogramasPorPersonaje = @{}

# ---------------------------------------------------------
# 6. Ejecución
# ---------------------------------------------------------

Write-Host ""
Write-Host "POLLITOS AL ATAQUE - Preparando imágenes" -ForegroundColor Cyan
Write-Host "  Origen : $CarpetaOrigen"
Write-Host "  Destino: $Destino"
Write-Host ""

# --- 6.1 Interfaz, escenario y resultados ---

if ($Solo -eq "" -or $Solo -eq "interfaz") {
    $Interfaz | ForEach-Object { Recortar $_[0] $_[1] $_[2] $_[3] $_[4] $_[5] }
    Write-Host "  Interfaz: $($Interfaz.Count) dibujos (botones, armas y paneles del HUD)."
}

if ($Solo -eq "" -or $Solo -eq "escenarios") {
    $Escenarios | ForEach-Object { Recortar $_[0] $_[1] $_[2] $_[3] $_[4] $_[5] }
    Write-Host "  Escenario: $($Escenarios.Count) dibujos (plataformas, árboles, arbustos y rocas)."
}

if ($Solo -eq "" -or $Solo -eq "resultados") {
    $Resultados | ForEach-Object { Recortar $_[0] $_[1] $_[2] $_[3] $_[4] $_[5] }
    Write-Host "  Resultados: $($Resultados.Count) láminas (victoria y derrota)."
}

# --- 6.2 Pollitos ---

if ($Solo -eq "" -or $Solo -eq "personajes") {
    foreach ($personaje in $Personajes) {
        $estados = [ordered]@{}

        foreach ($clave in $Fotogramas.Keys) {
            $estados[$clave] = $Fotogramas[$clave]
        }

        if ($FotogramasPorPersonaje.ContainsKey($personaje.clave)) {
            foreach ($clave in $FotogramasPorPersonaje[$personaje.clave].Keys) {
                $estados[$clave] = $FotogramasPorPersonaje[$personaje.clave][$clave]
            }
        }

        foreach ($estado in $estados.Keys) {
            $indice = [int]$estados[$estado]

            if ($indice -lt 0 -or $indice -ge $personaje.recortes.Count) {
                throw "El fotograma $indice de $($personaje.clave) no existe (0..19)."
            }

            $partes = $personaje.recortes[$indice] -split ","
            $salida = "personajes\$($personaje.clave)\$estado.png"

            Recortar $personaje.hoja ([int]$partes[0]) ([int]$partes[1]) ([int]$partes[2]) ([int]$partes[3]) $salida
        }

        $resumen = ($estados.Keys | ForEach-Object { "$_=$($estados[$_])" }) -join " "
        Write-Host "  $($personaje.nombre): $resumen"
    }
}

# --- 6.3 Hoja de verificación de los pollitos ---

<#
    Comprueba de un vistazo los fotogramas de los seis pollitos: dibuja en
    una sola imagen varias poses de cada uno con su número de rejilla
    encima. Sirve para elegir los fotogramas de la tabla $Fotogramas.

    @returns Nada (guarda el PNG en la raíz del proyecto).
#>
function Crear-HojaVerificacion {
    $candidatos = @(0, 1, 3, 9, 10, 14, 18, 19)
    $anchoCelda = 110
    $altoCelda = 136
    $lienzo = New-Object System.Drawing.Bitmap(($anchoCelda * $candidatos.Count), ($altoCelda * $Personajes.Count))
    $grafico = [System.Drawing.Graphics]::FromImage($lienzo)
    $fuente = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
    $pincel = [System.Drawing.Brushes]::Black

    try {
        $grafico.Clear([System.Drawing.Color]::White)

        for ($fila = 0; $fila -lt $Personajes.Count; $fila++) {
            $personaje = $Personajes[$fila]
            $hoja = Obtener-Bitmap $personaje.hoja

            try {
                for ($columna = 0; $columna -lt $candidatos.Count; $columna++) {
                    $indice = $candidatos[$columna]
                    $partes = $personaje.recortes[$indice] -split ","

                    $x = $columna * $anchoCelda
                    $y = $fila * $altoCelda

                    $grafico.DrawString("$($personaje.clave) [$indice]", $fuente, $pincel, ($x + 4), ($y + 2))

                    $recorteOrigen = New-Object System.Drawing.Rectangle(([int]$partes[0]), ([int]$partes[1]), ([int]$partes[2]), ([int]$partes[3]))
                    $destino = New-Object System.Drawing.Rectangle(($x + 6), ($y + 20), ([int]$partes[2]), ([int]$partes[3]))

                    $grafico.DrawImage($hoja, $destino, $recorteOrigen, [System.Drawing.GraphicsUnit]::Pixel)
                }
            } finally {
                $hoja.Dispose()
            }
        }
    } finally {
        $grafico.Dispose()
    }

    $lienzo.Save($Verificacion, [System.Drawing.Imaging.ImageFormat]::Png)
    $lienzo.Dispose()

    Write-Host "  Verificación de pollitos: $Verificacion"
}

if ($Solo -eq "" -or $Solo -eq "personajes") {
    Crear-HojaVerificacion
}

# --- 6.4 Resumen ---

Write-Host ""
Write-Host "Listo: $($Escritas.Count) archivos PNG escritos en assets\imagenes." -ForegroundColor Green
Write-Host ""

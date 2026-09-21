# =========================================================
# POLLITOS AL ATAQUE ONLINE - Prueba visual del canon
# =========================================================
#
# Comprueba, SIN abrir el navegador, que el dibujo
# assets/imagenes/interfaz/armas/canon.png se puede montar sobre el pollito
# con las mismas transformaciones que usa js/personaje.js:
#
#   - El barril debe apuntar en la direccion y el angulo que confirma el
#     servidor (30, 0, 60 y -30 grados, mirando a los dos lados).
#   - La boca del canon debe coincidir con el punto donde el SERVIDOR crea el
#     proyectil:  centro + cos/sin(angulo) * LONGITUD_CANON (34) * direccion
#     (ver servidor/partida.js). En la prueba ese punto se marca con un circulo.
#   - El recorte debe dejar solo el barril (fuera la bolsa que acompana al
#     dibujo original).
#
# Ademas mide el propio dibujo (eje principal por momentos, largo del barril,
# grosor y punto de la culata) e imprime los numeros que hay que copiar en
# js/recursos.js. Al terminar escribe _prueba_arma.png en la raiz.
#
# Uso:  powershell -ExecutionPolicy Bypass -File utilidades\prueba_arma.ps1

param(
    # Valores manuales (si se pasan, no se miden).
    [double]$AnguloArte = 0,
    [double]$LargoArte = 0,
    [double]$PivoteX = -1,
    [double]$PivoteY = -1,
    [double]$Recorte = 0,
    [double]$Grosor = 0,
    # Largo del barril ya dibujado en pantalla (px). La boca siempre queda en
    # el punto del proyectil del servidor.
    [double]$LargoBoca = 68
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$Raiz = Split-Path -Parent $PSScriptRoot
$Arte = Join-Path $Raiz "assets\imagenes"
$Canon = [System.Drawing.Image]::FromFile((Join-Path $Arte "interfaz\armas\canon.png"))
$Pollo = [System.Drawing.Image]::FromFile((Join-Path $Arte "personajes\1_lentes\quieto.png"))

# --- 1. Medir el dibujo del canon ----------------------------------------

$bmp = New-Object System.Drawing.Bitmap($Canon)
$puntos = New-Object System.Collections.ArrayList

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        if ($bmp.GetPixel($x, $y).A -gt 40) {
            [void]$puntos.Add(@([double]$x, [double]$y))
        }
    }
}

$n = $puntos.Count
$sx = 0.0
$sy = 0.0

foreach ($p in $puntos) {
    $sx += $p[0]
    $sy += $p[1]
}

$mx = $sx / $n
$my = $sy / $n
$sxx = 0.0
$syy = 0.0
$sxy = 0.0

foreach ($p in $puntos) {
    $dx = $p[0] - $mx
    $dy = $p[1] - $my
    $sxx += $dx * $dx
    $syy += $dy * $dy
    $sxy += $dx * $dy
}

# Eje principal (el barril domina el dibujo, asi que marca su inclinacion).
$theta = 0.5 * [Math]::Atan2(2 * $sxy, $sxx - $syy)

if ($AnguloArte -eq 0) { $AnguloArte = $theta * 180 / [Math]::PI }

$cosT = [Math]::Cos($AnguloArte * [Math]::PI / 180)
$sinT = [Math]::Sin($AnguloArte * [Math]::PI / 180)

# --- 2. Medir el barril DESDE LA CULATA -----------------------------------
#
# El dibujo trae el barril y, al lado, una bolsa. Todo lo que se aleje del eje
# mas de lo que mide el barril de ancho se descarta: asi la bolsa no estorba.

$pivotePxX = $PivoteX * $Canon.Width
$pivotePxY = $PivoteY * $Canon.Height

if ($Recorte -eq 0) { $Recorte = 46 }

$distancias = New-Object System.Collections.ArrayList

foreach ($p in $puntos) {
    $dx = $p[0] - $pivotePxX
    $dy = $p[1] - $pivotePxY
    $t = $dx * $cosT + $dy * $sinT
    $v = -$dx * $sinT + $dy * $cosT

    if ([Math]::Abs($v) -le $Recorte) {
        [void]$distancias.Add(@($t, $v))
    }
}

$tMax = ($distancias | ForEach-Object { $_[0] } | Measure-Object -Maximum).Maximum
$tMin = ($distancias | ForEach-Object { $_[0] } | Measure-Object -Minimum).Minimum
$vMedio = ($distancias | ForEach-Object { $_[1] } | Measure-Object -Average).Average
$vMaximo = ($distancias | ForEach-Object { $_[1] } | Measure-Object -Maximum).Maximum
$vMinimo = ($distancias | ForEach-Object { $_[1] } | Measure-Object -Minimum).Minimum

$largoMedido = $tMax

# Pivote corregido: si el barril no esta centrado en el eje, se desplaza el
# pivote en perpendicular para dejarlo en el centro del barril.
$pivoteCorregidoX = $pivotePxX - $vMedio * $sinT
$pivoteCorregidoY = $pivotePxY + $vMedio * $cosT

if ($LargoArte -eq 0) { $LargoArte = $largoMedido }
if ($Grosor -eq 0) { $Grosor = $vMaximo - $vMinimo }

Write-Host ""
Write-Host "MEDIDAS DE canon.png ($($Canon.Width)x$($Canon.Height))" -ForegroundColor Cyan
Write-Host ("  angulo del barril   : {0:N1} grados (y hacia abajo)" -f $AnguloArte)
Write-Host ("  culata -> boca      : {0:N1} px   (tras la culata: {1:N1} px)" -f $largoMedido, $tMin)
Write-Host ("  grosor en la banda  : {0:N1} px   (centro del barril: {1:N1} px)" -f ($vMaximo - $vMinimo), $vMedio)
Write-Host ("  pivote indicado     : {0:N3} / {1:N3}" -f $PivoteX, $PivoteY)
Write-Host ("  pivote corregido    : {0:N3} / {1:N3}" -f ($pivoteCorregidoX / $Canon.Width), ($pivoteCorregidoY / $Canon.Height))
Write-Host ""
Write-Host "VALORES USADOS EN LA PRUEBA" -ForegroundColor Cyan
Write-Host ("  angulo={0:N1}  largo={1:N1}  pivote={2:N3}/{3:N3}  recorte={4:N1}  barril dibujado={5:N1}" -f $AnguloArte, $LargoArte, $PivoteX, $PivoteY, $Recorte, $LargoBoca)
Write-Host ""

# --- 2. Dibujar la prueba -------------------------------------------------

$ALTO_POLLITO = 58
$LONGITUD_CANON = 34
$escala = $LargoBoca / $LargoArte
$recorte = $Recorte
$culataX = $PivoteX * $Canon.Width
$culataY = $PivoteY * $Canon.Height
$largo = $LargoArte
# La boca debe caer SIEMPRE en el punto donde el servidor crea el proyectil
# (34 px desde el centro). Si el barril dibujado mide mas de 34 px, la culata
# se retrasa para que la punta siga coincidiendo.
$desplazamiento = $LONGITUD_CANON - $LargoBoca

$lienzo = New-Object System.Drawing.Bitmap(990, 580)
$g = [System.Drawing.Graphics]::FromImage($lienzo)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(255, 122, 190, 236))

$plumaSuelo = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 90, 140, 90), 2)
$plumaBoca = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 220, 40, 40), 2)
$plumaCentro = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(160, 30, 30, 30), 1)
$pincelTexto = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$fuente = New-Object System.Drawing.Font("Trebuchet MS", 10, [System.Drawing.FontStyle]::Bold)

$casos = @(
    @(30, 1, "detras", 51), @(30, 1, "detras", 68), @(30, 1, "detras", 85),
    @(30, 1, "delante", 85), @(60, 1, "detras", 85), @(0, -1, "detras", 85)
)

for ($i = 0; $i -lt $casos.Count; $i++) {
    $sobre = [int]($i / 3)
    $columna = $i % 3
    $centroX = 165.0 + $columna * 320.0
    $centroY = 165.0 + $sobre * 285.0
    $angulo = $casos[$i][0]
    $direccion = $casos[$i][1]
    $orden = $casos[$i][2]
    $largoBoca = $casos[$i][3]
    $escalaCaso = $largoBoca / $LargoArte
    $desplazamientoCaso = $LONGITUD_CANON - $largoBoca
    $radianes = $angulo * [Math]::PI / 180
    $baseY = $centroY - 4

    # Linea del suelo.
    $g.DrawLine($plumaSuelo, [single]($centroX - 80), [single]($centroY + 17), [single]($centroX + 80), [single]($centroY + 17))

    $anchoPollo = $ALTO_POLLITO * $Pollo.Width / $Pollo.Height
    $matrizPollo = New-Object System.Drawing.Drawing2D.Matrix
    $matrizPollo.Translate([single]$centroX, [single]($centroY + 17), [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $matrizPollo.Scale([single]$direccion, 1, [System.Drawing.Drawing2D.MatrixOrder]::Prepend)

    # Canon: la culata se retrasa lo justo para que la boca caiga en el punto
    # del proyectil del servidor, con recorte en banda para dejar fuera la bolsa.
    $matrizCanon = New-Object System.Drawing.Drawing2D.Matrix
    $matrizCanon.Translate([single]$centroX, [single]$baseY, [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $matrizCanon.Scale([single]$direccion, 1, [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $matrizCanon.Rotate([single](-$angulo), [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $matrizCanon.Rotate([single](-$AnguloArte), [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $matrizCanon.Translate([single]$desplazamientoCaso, 0, [System.Drawing.Drawing2D.MatrixOrder]::Prepend)
    $matrizCanon.Scale([single]$escalaCaso, [single]$escalaCaso, [System.Drawing.Drawing2D.MatrixOrder]::Prepend)

    if ($orden -eq "detras") {
        $g.Transform = $matrizCanon
        $banda = New-Object System.Drawing.RectangleF(-8, [single](-$recorte), [single]($largo + 22), [single]($recorte * 2))
        $g.SetClip($banda)
        $g.DrawImage($Canon, [single](-$culataX), [single](-$culataY), [single]$Canon.Width, [single]$Canon.Height)
        $g.ResetClip()
    }

    # Pollito (mismo anclaje que js/personaje.js: pies en y + 17).
    $g.Transform = $matrizPollo
    $g.DrawImage($Pollo, [single](-$anchoPollo / 2), [single](-$ALTO_POLLITO), [single]$anchoPollo, [single]$ALTO_POLLITO)

    if ($orden -eq "delante") {
        $g.Transform = $matrizCanon
        $banda = New-Object System.Drawing.RectangleF(-8, [single](-$recorte), [single]($largo + 22), [single]($recorte * 2))
        $g.SetClip($banda)
        $g.DrawImage($Canon, [single](-$culataX), [single](-$culataY), [single]$Canon.Width, [single]$Canon.Height)
        $g.ResetClip()
    }

    # Punto donde el SERVIDOR crea el proyectil (debe caer en la boca).
    $g.ResetTransform()
    $bocaX = $centroX + [Math]::Cos($radianes) * $LONGITUD_CANON * $direccion
    $bocaY = $baseY - [Math]::Sin($radianes) * $LONGITUD_CANON
    $g.DrawLine($plumaCentro, [single]($centroX - 6), [single]$centroY, [single]($centroX + 6), [single]$centroY)
    $g.DrawLine($plumaCentro, [single]$centroX, [single]($centroY - 6), [single]$centroX, [single]($centroY + 6))
    $g.DrawEllipse($plumaBoca, [single]($bocaX - 4), [single]($bocaY - 4), 8, 8)
    $g.DrawString("angulo $angulo  dir $direccion  barril $largoBoca  $orden", $fuente, $pincelTexto, [single]($centroX - 84), [single]($centroY + 44))
}

$g.ResetTransform()
$salida = Join-Path $Raiz "_prueba_arma.png"
$lienzo.Save($salida, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$lienzo.Dispose()
$bmp.Dispose()
$Canon.Dispose()
$Pollo.Dispose()

Write-Host "Prueba escrita en $salida" -ForegroundColor Green

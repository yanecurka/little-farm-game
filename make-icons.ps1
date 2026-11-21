# Generates PWA icons (192x192 and 512x512) using System.Drawing.
# Run: powershell -ExecutionPolicy Bypass -File .\make-icons.ps1

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath($size, $radius) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = [float]($radius * $size / 512.0)
    $p.AddArc(0, 0, $r, $r, 180, 90)
    $p.AddArc($size - $r, 0, $r, $r, 270, 90)
    $p.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
    $p.AddArc(0, $size - $r, $r, $r, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-Icon([int]$size, [string]$file) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $s = $size / 512.0

    # Background
    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(124, 179, 66))
    $bgPath = New-RoundedRectPath $size 96
    $g.FillPath($bg, $bgPath)

    # Sun
    $sun = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 238, 88))
    $g.FillEllipse($sun, [float](358 * $s), [float](60 * $s), [float](96 * $s), [float](96 * $s))

    # Soil
    $soil = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(109, 76, 65))
    $soilPath = New-RoundedRectPath $size 28
    $g.TranslateTransform(0, [float](368 * $s))
    $soilPath.Reset()
    $w = [float]($size - 96 * $s)
    $h = [float](96 * $s)
    $x = [float](48 * $s)
    $r = [float](24 * $s)
    $soilPath.AddArc($x, 0, $r, $r, 180, 90)
    $soilPath.AddArc($x + $w - $r, 0, $r, $r, 270, 90)
    $soilPath.AddArc($x + $w - $r, $h - $r, $r, $r, 0, 90)
    $soilPath.AddArc($x, $h - $r, $r, $r, 90, 90)
    $soilPath.CloseFigure()
    $g.FillPath($soil, $soilPath)
    $g.TranslateTransform(0, [float](-368 * $s))

    # Stem
    $stemPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(46, 125, 50), [float](20 * $s))
    $g.DrawLine($stemPen, [float](256 * $s), [float](372 * $s), [float](256 * $s), [float](196 * $s))

    # Leaves
    $leaf = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(102, 187, 106))
    $state1 = $g.Save()
    $g.TranslateTransform([float](196 * $s), [float](224 * $s))
    $g.RotateTransform(-28)
    $g.FillEllipse($leaf, [float](-78 * $s), [float](-40 * $s), [float](156 * $s), [float](80 * $s))
    $g.Restore($state1)
    $state2 = $g.Save()
    $g.TranslateTransform([float](316 * $s), [float](188 * $s))
    $g.RotateTransform(28)
    $g.FillEllipse($leaf, [float](-78 * $s), [float](-40 * $s), [float](156 * $s), [float](80 * $s))
    $g.Restore($state2)

    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created: $file"
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Icon 192 (Join-Path $dir 'icon-192.png')
New-Icon 512 (Join-Path $dir 'icon-512.png')

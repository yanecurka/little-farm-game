# ============================================================
# serve.ps1 — простой локальный сервер для игры (без прав администратора)
# Запуск:  powershell -ExecutionPolicy Bypass -File .\serve.ps1
# Открыть на ПК: http://localhost:8080
# Открыть на телефоне: http://<IP-компьютера>:8080 (та же Wi-Fi)
# Остановка: Ctrl+C
# ============================================================

param(
    [int]$Port = 8080
)

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)

function Get-LocalIP {
    try {
        return (Get-NetIPAddress -AddressFamily IPv4 |
                Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
                Select-Object -First 1).IPAddress
    } catch { return '?' }
}

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
try {
    $listener.Start()
} catch {
    Write-Host "Не удалось запустить сервер на порту ${Port}: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$ip = Get-LocalIP
Write-Host ""
Write-Host "  Маленькая Ферма — сервер запущен" -ForegroundColor Green
Write-Host "  На этом ПК:  http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  В Wi-Fi:     http://$ip`:$Port" -ForegroundColor Cyan
Write-Host "  Остановка:   Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $buffer = New-Object byte[] 4096
            $text = New-Object System.Text.StringBuilder

            # Читаем заголовки запроса до пустой строки
            while ($stream.CanRead) {
                $n = $stream.Read($buffer, 0, $buffer.Length)
                if ($n -le 0) { break }
                [void]$text.Append([System.Text.Encoding]::ASCII.GetString($buffer, 0, $n))
                if ($text.ToString().Contains("`r`n`r`n")) { break }
            }

            $requestLine = ($text.ToString() -split "`r`n")[0]
            $parts = $requestLine -split ' '
            $path = '/'
            if ($parts.Count -ge 2) { $path = $parts[1] }
            $path = ([Uri]::UnescapeDataString($path) -split '\?')[0].TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }

            $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $path))
            if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $status = '403 Forbidden'
                $body = [System.Text.Encoding]::UTF8.GetBytes('403')
            } elseif (-not [System.IO.File]::Exists($full)) {
                $status = '404 Not Found'
                $body = [System.Text.Encoding]::UTF8.GetBytes('404 — файл не найден')
            } else {
                $status = '200 OK'
                $body = [System.IO.File]::ReadAllBytes($full)
            }

            $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
            $contentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
            $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        } catch {
            # клиент отключился — игнорируем
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}

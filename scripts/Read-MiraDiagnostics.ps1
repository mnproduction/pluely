[CmdletBinding()]
param(
    [string]$ConnectionFile = (Join-Path $env:LOCALAPPDATA 'com.mnproduction.pluely.local\diagnostics-gateway.json'),
    [ValidateRange(0, 50)][int]$Seconds = 0,
    [ValidateRange(200, 5000)][int]$IntervalMs = 1000
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Net.Http
$connection = Get-Content -LiteralPath $ConnectionFile -Raw | ConvertFrom-Json
if ($connection.schema -ne 1 -or $connection.address -notmatch '^127\.0\.0\.1:([0-9]{1,5})$') {
    throw 'Invalid local diagnostic connection.'
}
if ([int]$Matches[1] -lt 1 -or [int]$Matches[1] -gt 65535) { throw 'Invalid diagnostic port.' }
if ($connection.expires_at_ms -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) {
    throw 'Diagnostic session expired. Enable diagnostics again in Mira Desk.'
}
$null = Get-Process -Id $connection.pid -ErrorAction Stop
$encrypted = [Convert]::FromBase64String($connection.token_dpapi)
$decrypted = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$token = [Text.Encoding]::UTF8.GetString($decrypted)
[Array]::Clear($decrypted, 0, $decrypted.Length)
$handler = [Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$handler.AllowAutoRedirect = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(3)
$client.MaxResponseContentBufferSize = 262144
$client.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
try {
    $until = [DateTimeOffset]::UtcNow.AddSeconds($Seconds)
    do {
        $response = $client.GetAsync("http://$($connection.address)/v1/diagnostics").GetAwaiter().GetResult()
        try {
            $null = $response.EnsureSuccessStatusCode()
            $snapshot = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        } finally { $response.Dispose() }
        if ($snapshot.schema -notin @(1, 2) -or $snapshot.pid -ne $connection.pid) { throw 'Diagnostic process identity mismatch.' }
        $snapshot | ConvertTo-Json -Depth 12 -Compress
        if ($Seconds -eq 0 -or [DateTimeOffset]::UtcNow -ge $until) { break }
        Start-Sleep -Milliseconds $IntervalMs
    } while ([DateTimeOffset]::UtcNow -lt $until)
} finally {
    $client.Dispose()
    $token = $null
    $encrypted = $null
}

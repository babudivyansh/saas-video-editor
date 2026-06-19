$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
function Invoke-Api {
    param($Method, $Path, $Body, $Token)
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($null -ne $Body) {
            $json = ($Body | ConvertTo-Json -Depth 12 -Compress)
            $resp = Invoke-WebRequest -Uri "$base$Path" -Method $Method -Headers $headers -Body $json -UseBasicParsing
        } else {
            $resp = Invoke-WebRequest -Uri "$base$Path" -Method $Method -Headers $headers -UseBasicParsing
        }
        return @{ status = [int]$resp.StatusCode; body = ($resp.Content | ConvertFrom-Json) }
    } catch {
        $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        return @{ status = $code; err = $_.Exception.Message }
    }
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "render_$ts@example.com"
$phone = "3" + ("$ts").Substring(("$ts").Length-9)

Write-Host "1. Register user..." -ForegroundColor Cyan
$r = Invoke-Api POST "/api/auth/register" @{ firstName="Render"; lastName="Test"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" }
$token = $r.body.token
Write-Host "   register status=$($r.status)"

Write-Host "2. Create project..." -ForegroundColor Cyan
$r = Invoke-Api POST "/api/projects" @{ title="Render Pipeline Test"; productType="text-video" } $token
$projId = $r.body.project.id
Write-Host "   project id=$projId"

Write-Host "3. Kick off text-video render (real TTS + ffmpeg + S3)..." -ForegroundColor Cyan
$payload = @{
    projectId = $projId
    contactName = "Mom"
    messages = @(
        @{ type = "receiver"; text = "Hey, are you coming to dinner tonight?" },
        @{ type = "sender";   text = "Yes! I will be there at seven." }
    )
    bgVideoUrl = "$base/test-bg.mp4"
    receiverVoiceId = "william"
    narratorVoiceId = "william"
}
$r = Invoke-Api POST "/api/generate/text-video" $payload $token
Write-Host "   kickoff status=$($r.status) body=$($r.body | ConvertTo-Json -Compress)"
if ($r.status -ne 200) { Write-Host "RENDER KICKOFF FAILED" -ForegroundColor Red; exit 1 }

Write-Host "4. Poll project status (up to 5 min)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(5)
$status = "rendering"; $videoUrl = $null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $r = Invoke-Api GET "/api/projects/$projId" $null $token
    $status = $r.body.project.status
    $videoUrl = $r.body.project.videoUrl
    Write-Host "   status=$status"
    if ($status -eq "completed" -or $status -eq "failed") { break }
}

Write-Host "`n========== RESULT ==========" -ForegroundColor Yellow
Write-Host "Final status: $status"
Write-Host "Video URL: $videoUrl"
if ($status -eq "completed" -and $videoUrl) {
    # Verify the uploaded S3 object is reachable
    try {
        $head = Invoke-WebRequest -Uri $videoUrl -Method Head -UseBasicParsing
        Write-Host "S3 object reachable: HTTP $($head.StatusCode), Content-Length=$($head.Headers['Content-Length'])" -ForegroundColor Green
        Write-Host "PIPELINE PASS" -ForegroundColor Green
    } catch {
        $sc = $null; if ($_.Exception.Response) { $sc = [int]$_.Exception.Response.StatusCode }
        Write-Host "S3 HEAD failed: status=$sc (object may be private, that is OK if upload succeeded)" -ForegroundColor Yellow
        Write-Host "PIPELINE COMPLETED (video produced, S3 object not publicly readable)" -ForegroundColor Green
    }
} else {
    Write-Host "PIPELINE FAILED - check server logs" -ForegroundColor Red
}

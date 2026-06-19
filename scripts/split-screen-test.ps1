$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"

function Api($Method, $Path, $Body, $Token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($null -ne $Body) {
            $resp = Invoke-WebRequest -Uri "$base$Path" -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json -Depth 12 -Compress) -UseBasicParsing
        } else {
            $resp = Invoke-WebRequest -Uri "$base$Path" -Method $Method -Headers $headers -UseBasicParsing
        }
        return @{ status = [int]$resp.StatusCode; body = ($resp.Content | ConvertFrom-Json) }
    } catch { $c=$null; if ($_.Exception.Response){$c=[int]$_.Exception.Response.StatusCode}; return @{ status=$c; err=$_.Exception.Message } }
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "split_$ts@example.com"; $phone = "2" + ("$ts").Substring(("$ts").Length-9)

Write-Host "1. Register..." -ForegroundColor Cyan
$r = Api POST "/api/auth/register" @{ firstName="Split"; lastName="Test"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" }
$token = $r.body.token; Write-Host "   status=$($r.status)"

# Generate a short 'user' video (with audio) to upload
$FF = "C:\Users\ADMIN\OneDrive\Desktop\saas-video-editor\node_modules\ffmpeg-static\ffmpeg.exe"
$userVid = "C:\Users\ADMIN\OneDrive\Desktop\saas-video-editor\.tmp-bg\user-clip.mp4"
& $FF -y -hide_banner -loglevel error -f lavfi -i "testsrc=size=720x1280:rate=30:duration=4" -f lavfi -i "sine=frequency=440:duration=4" -pix_fmt yuv420p -c:v libx264 -preset superfast -c:a aac -shortest $userVid

Write-Host "2. Upload user video (real /api/upload via curl)..." -ForegroundColor Cyan
$uploadOut = & curl.exe -s -X POST "$base/api/upload" -H "Authorization: Bearer $token" -F "file=@$userVid;type=video/mp4"
$uploadedUrl = ($uploadOut | ConvertFrom-Json).url
Write-Host "   url=$uploadedUrl"

Write-Host "3. Create project with uploadedVideoUrl..." -ForegroundColor Cyan
$r = Api POST "/api/projects" @{ title="Split Test"; productType="split-screen"; uploadedVideoUrl=$uploadedUrl }
# create needs auth
$r = Api POST "/api/projects" @{ title="Split Test"; productType="split-screen"; uploadedVideoUrl=$uploadedUrl } $token
$projId = $r.body.project.id
Write-Host "   project id=$projId"

Write-Host "4. Kick off split-screen render..." -ForegroundColor Cyan
$bg = "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds/minecraft.mp4"
$r = Api POST "/api/generate/split-screen" @{ projectId=$projId; bgVideoUrl=$bg; subtitleStyleIndex=0; mode="oneword" } $token
Write-Host "   kickoff status=$($r.status) body=$($r.body | ConvertTo-Json -Compress)"
if ($r.status -ne 200) { Write-Host "KICKOFF FAILED" -ForegroundColor Red; exit 1 }

Write-Host "5. Poll status (up to 5 min)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(5); $status="rendering"; $videoUrl=$null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $r = Api GET "/api/projects/$projId" $null $token
    $status = $r.body.project.status; $videoUrl = $r.body.project.videoUrl
    Write-Host "   status=$status"
    if ($status -eq "completed" -or $status -eq "failed") { break }
}

Write-Host "`n========== RESULT ==========" -ForegroundColor Yellow
Write-Host "Final status: $status"
Write-Host "Video URL: $videoUrl"
if ($status -eq "completed" -and $videoUrl) {
    try {
        $h = Invoke-WebRequest -Uri $videoUrl -Method Head -UseBasicParsing
        Write-Host "OUTPUT reachable: HTTP $($h.StatusCode), Length=$($h.Headers['Content-Length'])" -ForegroundColor Green
        Write-Host "SPLIT-SCREEN PASS" -ForegroundColor Green
    } catch { Write-Host "completed but HEAD failed" -ForegroundColor Yellow }
} else { Write-Host "SPLIT-SCREEN FAILED - check server logs" -ForegroundColor Red }

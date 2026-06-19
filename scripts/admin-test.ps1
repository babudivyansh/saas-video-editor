$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$pass = 0; $fail = 0

function Invoke-Api {
    param($Method, $Path, $Body, $Token)
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        if ($null -ne $Body) {
            $json = ($Body | ConvertTo-Json -Depth 10 -Compress)
            $resp = Invoke-WebRequest -Uri "$base$Path" -Method $Method -Headers $headers -Body $json -UseBasicParsing
        } else {
            $resp = Invoke-WebRequest -Uri "$base$Path" -Method $Method -Headers $headers -UseBasicParsing
        }
        return @{ status = [int]$resp.StatusCode; body = ($resp.Content | ConvertFrom-Json) }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        return @{ status = $code }
    }
}
function Check($Name, $Cond, $Detail) {
    if ($Cond) { $script:pass++; Write-Host "PASS  $Name" -ForegroundColor Green }
    else { $script:fail++; Write-Host "FAIL  $Name  -- $Detail" -ForegroundColor Red }
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "admintest_$ts@example.com"
$phone = "5" + ("$ts").Substring(("$ts").Length-9)

$r = Invoke-Api POST "/api/auth/register" @{ firstName="Admin"; lastName="Test"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" }
Check "register (201)" ($r.status -eq 201) "status=$($r.status)"

# Promote to ADMIN using the app's prisma setup (driver adapter aware)
Push-Location "C:\Users\ADMIN\OneDrive\Desktop\saas-video-editor"
npx tsx scripts/promote-admin.ts $email
Pop-Location

# Re-login for a fresh session token reflecting the new role
$r = Invoke-Api POST "/api/auth/login" @{ method="email"; identifier=$email; password="password123" }
$atoken = $r.body.token
Check "admin login (200)" ($r.status -eq 200) "status=$($r.status)"

Write-Host "`n===== ADMIN ENDPOINTS =====" -ForegroundColor Cyan
$r = Invoke-Api GET "/api/admin/stats" $null $atoken
Check "admin stats (200)" ($r.status -eq 200 -and $null -ne $r.body.stats) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/users" $null $atoken
Check "admin users list (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/plans" $null $atoken
Check "admin plans list (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/purchases" $null $atoken
Check "admin purchases list (200)" ($r.status -eq 200) "status=$($r.status)"

# Create -> update -> soft-delete a plan
$r = Invoke-Api POST "/api/admin/plans" @{ slug="e2e_pack_$ts"; name="E2E Pack"; priceInPaise=9900; credits=10; features=@("test"); active=$true; sortOrder=99 } $atoken
$newPlanId = $r.body.plan.id
Check "admin create plan (201)" ($r.status -eq 201 -and [bool]$newPlanId) "status=$($r.status)"
if ($newPlanId) {
    $r = Invoke-Api PATCH "/api/admin/plans/$newPlanId" @{ priceInPaise=12900; active=$false } $atoken
    Check "admin update plan (200)" ($r.status -eq 200 -and $r.body.plan.priceInPaise -eq 12900) "status=$($r.status)"
    $r = Invoke-Api DELETE "/api/admin/plans/$newPlanId" $null $atoken
    Check "admin soft-delete plan (200)" ($r.status -eq 200 -and $r.body.plan.active -eq $false) "status=$($r.status)"
}

# Admin user role update (promote the 'other' demo: update self credits via users/[id])
$r = Invoke-Api GET "/api/admin/users" $null $atoken
$someUser = $r.body.users | Select-Object -First 1
if ($someUser) {
    $r = Invoke-Api PATCH "/api/admin/users/$($someUser.id)" @{ credits=$someUser.credits } $atoken
    Check "admin update user (200)" ($r.status -eq 200) "status=$($r.status)"
}

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Yellow
Write-Host "PASS: $pass   FAIL: $fail" -ForegroundColor Yellow

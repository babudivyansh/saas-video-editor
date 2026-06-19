$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$pass = 0; $fail = 0
$results = @()

function Invoke-Api {
    param($Method, $Path, $Body, $Token)
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $uri = "$base$Path"
    try {
        if ($Body -ne $null) {
            $json = ($Body | ConvertTo-Json -Depth 10 -Compress)
            $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -Body $json -UseBasicParsing
        } else {
            $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -UseBasicParsing
        }
        return @{ status = $resp.StatusCode; body = ($resp.Content | ConvertFrom-Json) }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        $errBody = $null
        try { $errBody = ($_.ErrorDetails.Message | ConvertFrom-Json) } catch {}
        return @{ status = $code; body = $errBody; error = $_.Exception.Message }
    }
}

function Check {
    param($Name, $Cond, $Detail)
    if ($Cond) {
        $script:pass++
        Write-Host "PASS  $Name" -ForegroundColor Green
    } else {
        $script:fail++
        Write-Host "FAIL  $Name  -- $Detail" -ForegroundColor Red
    }
    $script:results += [pscustomobject]@{ name = $Name; ok = [bool]$Cond; detail = "$Detail" }
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "e2e_$ts@example.com"
$phone = "9$([string]$ts).Substring(0,9)"
$phone = "9" + ("$ts").Substring(("$ts").Length-9)

Write-Host "`n===== AUTH: REGISTER =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/auth/register" @{ firstName="E2E"; lastName="Tester"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" }
Check "register new user (201)" ($r.status -eq 201) "status=$($r.status) body=$($r.body | ConvertTo-Json -Compress)"
$token = $r.body.token
Check "register returns token" ([bool]$token) "no token"

Write-Host "`n===== AUTH: REGISTER VALIDATION =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/auth/register" @{ firstName="E2E"; lastName="Tester"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" }
Check "duplicate email rejected (409)" ($r.status -eq 409) "status=$($r.status)"
$r = Invoke-Api POST "/api/auth/register" @{ firstName="A"; lastName="B"; email="bad"; phone="123"; password="short"; confirmPassword="short" }
Check "invalid email/phone/pw rejected (400)" ($r.status -eq 400) "status=$($r.status)"
$r = Invoke-Api POST "/api/auth/register" @{ firstName="A"; lastName="B"; email="ok_$ts@x.com"; phone="911$ts"; password="password123"; confirmPassword="nomatch1" }
Check "password mismatch rejected (400)" ($r.status -eq 400) "status=$($r.status)"

Write-Host "`n===== AUTH: LOGIN (password) =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/auth/login" @{ method="email"; identifier=$email; password="password123" }
Check "login email+password (200)" ($r.status -eq 200) "status=$($r.status) body=$($r.body|ConvertTo-Json -Compress)"
$token = $r.body.token
$r = Invoke-Api POST "/api/auth/login" @{ method="phone"; identifier=$phone; password="password123" }
Check "login phone+password (200)" ($r.status -eq 200) "status=$($r.status)"
$token = $r.body.token
$r = Invoke-Api POST "/api/auth/login" @{ method="email"; identifier=$email; password="wrongpass" }
Check "wrong password rejected (401)" ($r.status -eq 401) "status=$($r.status)"

Write-Host "`n===== AUTH: OTP LOGIN =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/auth/send-otp" @{ method="email"; identifier=$email }
Check "send-otp existing user (200)" ($r.status -eq 200) "status=$($r.status)"
$devCode = $r.body.devCode
Check "send-otp returns devCode" ([bool]$devCode) "channel=$($r.body.channel)"
$r2 = Invoke-Api POST "/api/auth/send-otp" @{ method="email"; identifier="nobody_$ts@x.com" }
Check "send-otp unknown user (404)" ($r2.status -eq 404) "status=$($r2.status)"
$r = Invoke-Api POST "/api/auth/verify-otp" @{ method="email"; identifier=$email; otp=$devCode }
Check "verify-otp correct code (200)" ($r.status -eq 200) "status=$($r.status)"
$token = $r.body.token
$r = Invoke-Api POST "/api/auth/verify-otp" @{ method="email"; identifier=$email; otp="000000" }
Check "verify-otp wrong/expired (401)" ($r.status -eq 401) "status=$($r.status)"

Write-Host "`n===== AUTH: ME + PROFILE =====" -ForegroundColor Cyan
$r = Invoke-Api GET "/api/auth/me" $null $token
Check "GET /me authed (200)" ($r.status -eq 200) "status=$($r.status)"
Check "/me returns phone+firstName" ($r.body.user.phone -eq $phone -and $r.body.user.firstName -eq "E2E") "phone=$($r.body.user.phone) fn=$($r.body.user.firstName)"
$r = Invoke-Api GET "/api/auth/me"
Check "GET /me no token (401)" ($r.status -eq 401) "status=$($r.status)"
$newPhone = "8" + ("$ts").Substring(("$ts").Length-9)
$r = Invoke-Api PATCH "/api/auth/profile" @{ name="E2E Renamed"; phone=$newPhone } $token
Check "PATCH profile name+phone (200)" ($r.status -eq 200) "status=$($r.status) body=$($r.body|ConvertTo-Json -Compress)"
$r = Invoke-Api GET "/api/auth/me" $null $token
Check "profile persisted" ($r.body.user.phone -eq $newPhone) "phone=$($r.body.user.phone)"

Write-Host "`n===== AUTH: CHANGE PASSWORD =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/auth/change-password" @{ currentPassword="password123"; newPassword="newpassword456" } $token
Check "change-password (200)" ($r.status -eq 200) "status=$($r.status) body=$($r.body|ConvertTo-Json -Compress)"
$r = Invoke-Api POST "/api/auth/login" @{ method="email"; identifier=$email; password="newpassword456" }
Check "login with new password (200)" ($r.status -eq 200) "status=$($r.status)"
$token = $r.body.token

Write-Host "`n===== PLANS (public) =====" -ForegroundColor Cyan
$r = Invoke-Api GET "/api/plans"
Check "GET /plans (200)" ($r.status -eq 200) "status=$($r.status)"
Check "plans seeded (>=3)" ($r.body.plans.Count -ge 3) "count=$($r.body.plans.Count)"

Write-Host "`n===== PROJECTS CRUD =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/projects" @{ title="E2E Project"; script="hello"; productType="text-video" } $token
Check "create project (201)" ($r.status -eq 201) "status=$($r.status)"
$pid = $r.body.project.id
$r = Invoke-Api GET "/api/projects" $null $token
Check "list projects (200)" ($r.status -eq 200 -and $r.body.projects.Count -ge 1) "count=$($r.body.projects.Count)"
$r = Invoke-Api GET "/api/projects/$pid" $null $token
Check "get project by id (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api PATCH "/api/projects/$pid" @{ title="E2E Renamed Project" } $token
Check "update project (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api DELETE "/api/projects/$pid" $null $token
Check "delete project (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/projects" $null $token
Check "create project requires auth (401)" ((Invoke-Api POST "/api/projects" @{ title="x" }).status -eq 401) "no-auth allowed"

Write-Host "`n===== ADMIN (as regular user -> 403) =====" -ForegroundColor Cyan
$r = Invoke-Api GET "/api/admin/stats" $null $token
Check "admin stats forbidden for user (403)" ($r.status -eq 403) "status=$($r.status)"

Write-Host "`n===== ADMIN (as admin) =====" -ForegroundColor Cyan
$ra = Invoke-Api POST "/api/auth/login" @{ method="email"; identifier="divyansh.verma525@gmail.com"; password="changeme123" }
if ($ra.status -eq 200) {
    $atoken = $ra.body.token
    Check "admin login (200)" $true ""
    $r = Invoke-Api GET "/api/admin/stats" $null $atoken
    Check "admin stats (200)" ($r.status -eq 200) "status=$($r.status)"
    $r = Invoke-Api GET "/api/admin/users" $null $atoken
    Check "admin users list (200)" ($r.status -eq 200) "status=$($r.status)"
    $r = Invoke-Api GET "/api/admin/plans" $null $atoken
    Check "admin plans list (200)" ($r.status -eq 200) "status=$($r.status)"
    $r = Invoke-Api GET "/api/admin/purchases" $null $atoken
    Check "admin purchases list (200)" ($r.status -eq 200) "status=$($r.status)"
} else {
    Check "admin login (200)" $false "status=$($ra.status) -- admin password may have been changed; skipping admin checks"
    $atoken = $null
}

Write-Host "`n===== BILLING CHECKOUT (Razorpay) =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/billing/checkout" @{ packId="pack_starter" } $token
Check "checkout creates order (200)" ($r.status -eq 200 -and [bool]$r.body.orderId) "status=$($r.status) body=$($r.body|ConvertTo-Json -Compress)"
$r = Invoke-Api POST "/api/billing/checkout" @{ packId="nonexistent" } $token
Check "checkout invalid pack (400)" ($r.status -eq 400) "status=$($r.status)"

Write-Host "`n===== GENERATE: SCRIPT (Gemini) =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/generate/script" @{ topic="benefits of morning walks"; style="engaging" } $token
Check "generate script (200)" ($r.status -eq 200) "status=$($r.status) body=$($r.body|ConvertTo-Json -Compress -Depth 3)"

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Yellow
Write-Host "PASS: $pass" -ForegroundColor Green
Write-Host "FAIL: $fail" -ForegroundColor Red
$results | Where-Object { -not $_.ok } | ForEach-Object { Write-Host ("  FAILED: " + $_.name + " :: " + $_.detail) -ForegroundColor Red }
$results | ConvertTo-Json -Depth 4 | Out-File "C:\Users\ADMIN\OneDrive\Desktop\saas-video-editor\scripts\e2e-results.json" -Encoding utf8

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
$email = "retest_$ts@example.com"
$phone = "7" + ("$ts").Substring(("$ts").Length-9)

# Fresh user
$r = Invoke-Api POST "/api/auth/register" @{ firstName="Re"; lastName="Test"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" }
$token = $r.body.token
Check "register (201)" ($r.status -eq 201) "status=$($r.status)"

Write-Host "`n===== PROJECTS CRUD (fixed var) =====" -ForegroundColor Cyan
$r = Invoke-Api POST "/api/projects" @{ title="Retest Project"; script="hi"; productType="text-video" } $token
$projId = $r.body.project.id
Check "create project (201)" ($r.status -eq 201 -and [bool]$projId) "status=$($r.status) id=$projId"
$r = Invoke-Api GET "/api/projects/$projId" $null $token
Check "get project by id (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api PATCH "/api/projects/$projId" @{ title="Retest Renamed"; script="updated" } $token
Check "update project (200)" ($r.status -eq 200 -and $r.body.project.title -eq "Retest Renamed") "status=$($r.status) title=$($r.body.project.title)"
$r = Invoke-Api GET "/api/projects/$projId" $null $token
Check "update persisted" ($r.body.project.script -eq "updated") "script=$($r.body.project.script)"
# ownership isolation: a different user cannot see this project
$email2 = "other_$ts@example.com"; $phone2 = "6" + ("$ts").Substring(("$ts").Length-9)
$r2 = Invoke-Api POST "/api/auth/register" @{ firstName="Ot"; lastName="Her"; email=$email2; phone=$phone2; password="password123"; confirmPassword="password123" }
$token2 = $r2.body.token
$r = Invoke-Api GET "/api/projects/$projId" $null $token2
Check "other user cannot access project (404)" ($r.status -eq 404) "status=$($r.status)"
$r = Invoke-Api DELETE "/api/projects/$projId" $null $token
Check "delete project (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/projects/$projId" $null $token
Check "project gone after delete (404)" ($r.status -eq 404) "status=$($r.status)"

Write-Host "`n===== ADMIN ENDPOINTS (promoted user) =====" -ForegroundColor Cyan
# Promote the retest user to ADMIN directly in the DB, then re-login for a fresh session token.
$env:ADMIN_EMAIL = $email
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.update({where:{email:process.env.ADMIN_EMAIL},data:{role:'ADMIN'}}).then(()=>{console.log('promoted');return p.`$disconnect()}).catch(e=>{console.error(e);process.exit(1)})" | Out-Null
$r = Invoke-Api POST "/api/auth/login" @{ method="email"; identifier=$email; password="password123" }
$atoken = $r.body.token
Check "admin re-login (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/stats" $null $atoken
Check "admin stats (200)" ($r.status -eq 200 -and $null -ne $r.body.stats) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/users" $null $atoken
Check "admin users list (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/plans" $null $atoken
Check "admin plans list (200)" ($r.status -eq 200) "status=$($r.status)"
$r = Invoke-Api GET "/api/admin/purchases" $null $atoken
Check "admin purchases list (200)" ($r.status -eq 200) "status=$($r.status)"
# create a plan via admin, then deactivate it
$r = Invoke-Api POST "/api/admin/plans" @{ slug="e2e_pack_$ts"; name="E2E Pack"; priceInPaise=9900; credits=10; features=@("test"); active=$true; sortOrder=99 } $atoken
$newPlanId = $r.body.plan.id
Check "admin create plan (200/201)" (($r.status -eq 200 -or $r.status -eq 201) -and [bool]$newPlanId) "status=$($r.status)"
if ($newPlanId) {
    $r = Invoke-Api PATCH "/api/admin/plans/$newPlanId" @{ active=$false } $atoken
    Check "admin update plan (200)" ($r.status -eq 200) "status=$($r.status)"
}

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Yellow
Write-Host "PASS: $pass   FAIL: $fail" -ForegroundColor Yellow

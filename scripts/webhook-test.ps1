$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$pass = 0; $fail = 0
function Check($Name, $Cond, $Detail) {
    if ($Cond) { $script:pass++; Write-Host "PASS  $Name" -ForegroundColor Green }
    else { $script:fail++; Write-Host "FAIL  $Name  -- $Detail" -ForegroundColor Red }
}

# Load the webhook secret from .env (server signs/verifies with this same value).
$envLine = (Get-Content "C:\Users\ADMIN\OneDrive\Desktop\saas-video-editor\.env" | Where-Object { $_ -match '^RAZORPAY_WEBHOOK_SECRET=' })
$secret = ($envLine -split '=',2)[1].Trim().Trim('"')

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "webhook_$ts@example.com"
$phone = "4" + ("$ts").Substring(("$ts").Length-9)

# Register a user, capture id + starting credits
$reg = Invoke-WebRequest -Uri "$base/api/auth/register" -Method POST -Headers @{ "Content-Type"="application/json" } -Body (@{ firstName="Web"; lastName="Hook"; email=$email; phone=$phone; password="password123"; confirmPassword="password123" } | ConvertTo-Json) -UseBasicParsing
$token = ($reg.Content | ConvertFrom-Json).token
$me = (Invoke-WebRequest -Uri "$base/api/auth/me" -Headers @{ Authorization="Bearer $token" } -UseBasicParsing).Content | ConvertFrom-Json
$userId = $me.user.id
$startCredits = $me.user.credits
Check "setup user (credits=$startCredits)" ([bool]$userId) "no user"

# Build a payment.captured event for pack_starter (60 credits per seed)
$paymentId = "pay_test_$ts"
$payload = @{
    event = "payment.captured"
    payload = @{ payment = @{ entity = @{
        id = $paymentId
        order_id = "order_test_$ts"
        amount = 79900
        notes = @{ userId = $userId; packId = "pack_starter"; credits = "60" }
    } } }
} | ConvertTo-Json -Depth 10 -Compress

# Sign with HMAC-SHA256 using the same secret the server verifies against
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secret)
$hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
$sig = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })

# 1) Valid signature -> credits granted
try {
    $resp = Invoke-WebRequest -Uri "$base/api/webhooks/razorpay" -Method POST -Headers @{ "Content-Type"="application/json"; "x-razorpay-signature"=$sig } -Body $payload -UseBasicParsing
    Check "webhook valid signature (200)" ($resp.StatusCode -eq 200) "status=$($resp.StatusCode)"
} catch { Check "webhook valid signature (200)" $false "ex=$($_.Exception.Message)" }

$me2 = (Invoke-WebRequest -Uri "$base/api/auth/me" -Headers @{ Authorization="Bearer $token" } -UseBasicParsing).Content | ConvertFrom-Json
Check "credits incremented by 60 ($startCredits -> $($me2.user.credits))" ($me2.user.credits -eq ($startCredits + 60)) "got $($me2.user.credits)"
Check "plan tier set to Starter" ($me2.user.plan.slug -eq "pack_starter") "plan=$($me2.user.plan.slug)"

# 2) Replay same event -> idempotent, no double credit
try {
    $resp = Invoke-WebRequest -Uri "$base/api/webhooks/razorpay" -Method POST -Headers @{ "Content-Type"="application/json"; "x-razorpay-signature"=$sig } -Body $payload -UseBasicParsing
} catch {}
$me3 = (Invoke-WebRequest -Uri "$base/api/auth/me" -Headers @{ Authorization="Bearer $token" } -UseBasicParsing).Content | ConvertFrom-Json
Check "replay is idempotent (still $($me2.user.credits))" ($me3.user.credits -eq $me2.user.credits) "got $($me3.user.credits)"

# 3) Bad signature -> 400 (not 500)
$badStatus = $null
try {
    $resp = Invoke-WebRequest -Uri "$base/api/webhooks/razorpay" -Method POST -Headers @{ "Content-Type"="application/json"; "x-razorpay-signature"="deadbeef" } -Body $payload -UseBasicParsing
    $badStatus = $resp.StatusCode
} catch { if ($_.Exception.Response) { $badStatus = [int]$_.Exception.Response.StatusCode } }
Check "bad/short signature rejected (400)" ($badStatus -eq 400) "status=$badStatus"

# 4) Purchase recorded -> shows in billing history
$pur = (Invoke-WebRequest -Uri "$base/api/auth/purchases" -Headers @{ Authorization="Bearer $token" } -UseBasicParsing).Content | ConvertFrom-Json
Check "purchase recorded in history" (($pur.purchases | Where-Object { $_.id -eq $paymentId }).Count -ge 1) "purchases=$($pur.purchases.Count)"

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Yellow
Write-Host "PASS: $pass   FAIL: $fail" -ForegroundColor Yellow

param(
    [string]$BaseUrl = "http://localhost:8000",
    [string]$FallbackBaseUrl = "http://localhost",
    [switch]$SkipCash,
    [string]$Email = "",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

function New-ClientRequestId {
    return [guid]::NewGuid().ToString()
}

function Invoke-Api {
    param(
        [ValidateSet("GET", "POST", "PUT", "DELETE")]
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )

    $headers = @{ Accept = "application/json" }
    if ($script:AccessToken) {
        $headers["Authorization"] = "Bearer $($script:AccessToken)"
    }

    $params = @{
        Uri         = "$BaseUrl$Path"
        Method      = $Method
        TimeoutSec  = 20
        ErrorAction = "Stop"
        Headers     = $headers
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }

    return Invoke-RestMethod @params
}

function Test-Health {
    param([string]$Url)
    try {
        $res = Invoke-RestMethod -Uri "$Url/health" -Method GET -TimeoutSec 10 -ErrorAction Stop
        return ($res.status -eq "ok")
    }
    catch {
        return $false
    }
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

function Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    try {
        $result = & $Action
        Write-Host ("[OK]   {0}" -f $Name) -ForegroundColor Green
        return $result
    }
    catch {
        Write-Host ("[FAIL] {0}" -f $Name) -ForegroundColor Red
        Write-Host ("       {0}" -f $_.Exception.Message) -ForegroundColor DarkRed
        throw
    }
}

if (-not (Test-Health -Url $BaseUrl)) {
    if ($FallbackBaseUrl -and (Test-Health -Url $FallbackBaseUrl)) {
        Write-Host "Primary base URL unavailable. Switching to fallback: $FallbackBaseUrl" -ForegroundColor Yellow
        $BaseUrl = $FallbackBaseUrl
    }
}

Write-Host "Running smoke test against $BaseUrl" -ForegroundColor Cyan

$script:AccessToken = $null

if (-not $Email) {
    $Email = $env:SMOKE_EMAIL
}
if (-not $Password) {
    $Password = $env:SMOKE_PASSWORD
}

if ($Email -and $Password) {
    $loginOk = $false
    try {
        $loginResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -TimeoutSec 20 -ErrorAction Stop -ContentType "application/json" -Body (@{
            email    = $Email
            password = $Password
        } | ConvertTo-Json -Compress)
        $script:AccessToken = $loginResp.access
        $loginOk = $true
        Write-Host "[OK]   Auth login (smoke)" -ForegroundColor Green
    }
    catch {
        try {
            $loginResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -TimeoutSec 20 -ErrorAction Stop -ContentType "application/json" -Body (@{
                username = $Email
                password = $Password
            } | ConvertTo-Json -Compress)
            $script:AccessToken = $loginResp.access
            $loginOk = $true
            Write-Host "[OK]   Auth login (smoke via username)" -ForegroundColor Green
        }
        catch {
            $detail = ""
            if ($_.Exception.Response) {
                try {
                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    $detail = $reader.ReadToEnd()
                }
                catch {}
            }
            throw "Falha no login do smoke test. Email/usuario ou senha invalidos. Detalhe API: $detail"
        }
    }
    if (-not $loginOk) {
        throw "Falha no login do smoke test com as credenciais informadas."
    }
}

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$phone = "5599$((Get-Random -Minimum 1000000 -Maximum 9999999))"

$health = Step "Health endpoint" {
    $res = Invoke-Api -Method GET -Path "/health"
    Assert-True ($res.status -eq "ok") "Health endpoint returned unexpected payload."
    $res
}

$categories = Step "List categories" {
    @(Invoke-Api -Method GET -Path "/api/categories")
}

if ($categories.Count -eq 0) {
    $category = Step "Create fallback category" {
        Invoke-Api -Method POST -Path "/api/categories" -Body @{
            name       = "Categoria Smoke $stamp"
            sort_order = 999
            active     = $true
        }
    }
    $categoryId = [int]$category.id
}
else {
    $categoryId = [int]$categories[0].id
}

$products = Step "List products by category" {
    @(Invoke-Api -Method GET -Path "/api/products?category_id=$categoryId")
}

if ($products.Count -eq 0) {
    $product = Step "Create fallback product" {
        Invoke-Api -Method POST -Path "/api/products" -Body @{
            category       = $categoryId
            name           = "Produto Smoke $stamp"
            description    = "Produto para smoke test"
            active         = $true
            sold_by_weight = $false
        }
    }

    $productId = [int]$product.id

    Step "Create fallback product price" {
        Invoke-Api -Method PUT -Path "/api/products/$productId/price" -Body @{
            store_id      = 1
            price         = "9.90"
            cost          = "4.00"
            freight       = "0.20"
            other         = "0.10"
            tax_pct       = "5"
            overhead_pct  = "5"
            margin_pct    = "20"
        } | Out-Null
    } | Out-Null
}
else {
    $productId = [int]$products[0].id
}

Step "Loyalty earn (creates customer if needed)" {
    Invoke-Api -Method POST -Path "/api/loyalty/earn" -Body @{
        phone  = $phone
        points = 5
        reason = "smoke test"
    } | Out-Null
} | Out-Null

Step "Loyalty customer lookup" {
    $res = Invoke-Api -Method GET -Path "/api/loyalty/customer?phone=$phone"
    Assert-True ($null -ne $res.customer) "Customer was not returned."
    $res
} | Out-Null

if (-not $SkipCash) {
    $statusBeforeOrder = Step "Cash status before order" {
        Invoke-Api -Method GET -Path "/api/cash/status"
    }

    if (-not $statusBeforeOrder.open) {
        Step "Open cash session before first order" {
            Invoke-Api -Method POST -Path "/api/cash/open" -Body @{
                initial_float = "100.00"
            } | Out-Null
        } | Out-Null
    }
}

$orderRequestId = New-ClientRequestId
$order = Step "Create order (idempotent key)" {
    $res = Invoke-Api -Method POST -Path "/api/orders" -Body @{
        type                = "COUNTER"
        customer_phone      = $phone
        customer_name       = "Smoke"
        customer_last_name  = "Test"
        customer_neighborhood = "Centro"
        client_request_id   = $orderRequestId
    }
    Assert-True ($null -ne $res.id) "Order ID not returned."
    $res
}

$orderId = "$($order.id)"

$item = Step "Add item to order" {
    $res = Invoke-Api -Method POST -Path "/api/orders/$orderId/items" -Body @{
        product_id = $productId
        qty        = "1"
        notes      = "Smoke test item"
    }
    Assert-True ($null -ne $res.id) "Order item ID not returned."
    $res
}

Step "Edit order item" {
    $res = Invoke-Api -Method PUT -Path "/api/orders/$orderId/items/$($item.id)" -Body @{
        qty   = "2"
        notes = "Smoke test item edited"
    }
    Assert-True ($res.notes -like "*edited*") "Order item was not edited."
    $res
} | Out-Null

Step "Order open list has selected order" {
    $res = @(Invoke-Api -Method GET -Path "/api/orders/open")
    $found = $res | Where-Object { $_.id -eq $orderId }
    Assert-True ($null -ne $found) "Created order not found in open orders list."
    $res
} | Out-Null

Step "Send order to kitchen" {
    $res = Invoke-Api -Method POST -Path "/api/orders/$orderId/send-kitchen"
    Assert-True ($res.status -eq "sent") "Kitchen send status is not 'sent'."
    $res
} | Out-Null

Step "Kitchen queue has orders" {
    $res = @(Invoke-Api -Method GET -Path "/api/kitchen/queue")
    Assert-True ($res.Count -ge 1) "Kitchen queue is empty."
    $res
} | Out-Null

Step "Kitchen mark ready" {
    $res = Invoke-Api -Method POST -Path "/api/kitchen/$orderId/ready"
    Assert-True ($res.status -eq "ready") "Kitchen ready status mismatch."
    $res
} | Out-Null

Step "Kitchen back to prep" {
    $res = Invoke-Api -Method POST -Path "/api/kitchen/$orderId/back-to-prep"
    Assert-True ($res.status -eq "preparing") "Kitchen back-to-prep status mismatch."
    $res
} | Out-Null

$closeRequestId = New-ClientRequestId
$orderForClose = Step "Reload open order before close" {
    $res = Invoke-Api -Method GET -Path "/api/orders/open"
    $current = @($res) | Where-Object { $_.id -eq $orderId } | Select-Object -First 1
    Assert-True ($null -ne $current) "Order not found before close."
    $current
}

Step "Close order" {
    $amountToClose = "$($orderForClose.total)"
    $res = Invoke-Api -Method POST -Path "/api/orders/$orderId/close" -Body @{
        discount          = "0"
        payments          = @(@{
            method = "CASH"
            amount = $amountToClose
            meta   = @{ source = "smoke_test" }
        })
        use_loyalty_points = $false
        client_request_id  = $closeRequestId
    }
    Assert-True ($res.status -eq "PAID") "Order did not close as PAID."
    $res
} | Out-Null

Step "Closed orders listing" {
    $res = @(Invoke-Api -Method GET -Path "/api/orders/closed")
    Assert-True ($res.Count -ge 1) "Closed orders returned empty list."
    $res
} | Out-Null

Step "Reports summary" {
    Invoke-Api -Method GET -Path "/api/reports/summary" | Out-Null
} | Out-Null

Step "Reports by payment" {
    Invoke-Api -Method GET -Path "/api/reports/by_payment" | Out-Null
} | Out-Null

Step "Reports by product" {
    Invoke-Api -Method GET -Path "/api/reports/by_product" | Out-Null
} | Out-Null

if (-not $SkipCash) {
    $status = Step "Cash status" {
        Invoke-Api -Method GET -Path "/api/cash/status"
    }

    Step "Cash move (reforco)" {
        Invoke-Api -Method POST -Path "/api/cash/move" -Body @{
            type   = "REFORCO"
            amount = "5.00"
            reason = "smoke test"
        } | Out-Null
    } | Out-Null
}

Write-Host ""
Write-Host "Smoke test finished successfully." -ForegroundColor Green
Write-Host "Order tested: $orderId"
Write-Host "Phone tested: $phone"

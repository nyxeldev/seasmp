$BASE = "http://localhost:4000"
$pass = 0
$fail = 0
$ts   = [int64](Get-Date -UFormat %s)   # unique suffix for test data

function req {
    param($label, $method, $path, $body, $token, $expectStatus = 200)
    $uri    = "$BASE$path"
    $params = @{ Uri = $uri; Method = $method; UseBasicParsing = $true; ErrorAction = "SilentlyContinue" }
    if ($body)  { $params.Body = ($body | ConvertTo-Json -Depth 10); $params.ContentType = "application/json" }
    if ($token) { $params.Headers = @{ Authorization = "Bearer $token" } }
    try {
        $r    = Invoke-WebRequest @params
        $code = $r.StatusCode
        $json = $r.Content | ConvertFrom-Json
        $ok   = $code -eq $expectStatus
        $script:pass += if ($ok) { 1 } else { 0 }
        $script:fail += if ($ok) { 0 } else { 1 }
        $mark  = if ($ok) { "PASS" } else { "FAIL (got $code, want $expectStatus)" }
        Write-Host "  [$mark] $label" -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
        return $json
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $ok   = $code -eq $expectStatus
        $script:pass += if ($ok) { 1 } else { 0 }
        $script:fail += if ($ok) { 0 } else { 1 }
        $mark  = if ($ok) { "PASS" } else { "FAIL (got $code, want $expectStatus)" }
        $errMsg = ""; try { $errMsg = ($_.ErrorDetails.Message | ConvertFrom-Json).error.message } catch {}
        Write-Host "  [$mark] $label $(if ($errMsg) { ":: $errMsg" })" -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
        return $null
    }
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  SEASMP API -- Full Test Suite" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# ── 1. Health ─────────────────────────────────────────────────────────────────
Write-Host "`n[1. Health]" -ForegroundColor Yellow
req "GET /health" GET "/health"

# ── 2. Auth ───────────────────────────────────────────────────────────────────
Write-Host "`n[2. Auth]" -ForegroundColor Yellow
$aL = req "POST /auth/login (admin)"   POST "/v1/auth/login" @{ email="admin@seasmp.uz";    password="Admin@1234"   }
$tL = req "POST /auth/login (teacher)" POST "/v1/auth/login" @{ email="teacher1@seasmp.uz"; password="Teacher@1234" }
$sL = req "POST /auth/login (student)" POST "/v1/auth/login" @{ email="student1@seasmp.uz"; password="Student@1234" }
req "POST /auth/login (bad password)"  POST "/v1/auth/login" @{ email="admin@seasmp.uz"; password="wrongpass"   } -expectStatus 401
req "POST /auth/login (empty fields)"  POST "/v1/auth/login" @{ email="";                password=""            } -expectStatus 400

$AT = $aL.data.accessToken
$TT = $tL.data.accessToken
$ST = $sL.data.accessToken
$teacherId = $tL.data.user.id
$studentId = $sL.data.user.id
$adminId   = $aL.data.user.id

# ── 3. Pick stable test fixtures BEFORE any mutation ─────────────────────────
# Strategy: start from student1's enrollments, find one in a course teacher1 owns.
# This guarantees both teacher1 has access AND student1 is enrolled.
$activeCourses = req "GET /courses?status=ACTIVE (admin)" GET "/v1/courses?status=ACTIVE&limit=100" -token $AT
$t1CourseIds   = ($activeCourses.data | Where-Object { $_.teacher.id -eq $teacherId }).id

$stuEnr = req "GET /enrollments (student1)" GET "/v1/enrollments" -token $ST
$enr1   = $stuEnr.data | Where-Object { $t1CourseIds -contains $_.course.id } | Select-Object -First 1
$enr1Id = $enr1.id
$c1Id   = $enr1.course.id
$c1Name = $enr1.course.title

Write-Host "    Fixture course  : '$c1Name' [$c1Id]" -ForegroundColor DarkGray
Write-Host "    Fixture enroll  : '$c1Name' for student1 [$enr1Id]" -ForegroundColor DarkGray

# ── 4. Users ──────────────────────────────────────────────────────────────────
Write-Host "`n[4. Users]" -ForegroundColor Yellow
req "GET /users/me (admin)"            GET  "/v1/users/me"  -token $AT
req "GET /users/me (teacher)"          GET  "/v1/users/me"  -token $TT
req "GET /users/me (student)"          GET  "/v1/users/me"  -token $ST
req "GET /users/me (unauthenticated)"  GET  "/v1/users/me"  -expectStatus 401
req "GET /users (admin)"               GET  "/v1/users"     -token $AT
req "GET /users?role=STUDENT"          GET  "/v1/users?role=STUDENT" -token $AT
req "GET /users?search=aziz"           GET  "/v1/users?search=aziz"  -token $AT
req "GET /users (student forbidden)"   GET  "/v1/users"     -token $ST -expectStatus 403

$newU = req "POST /users (create user)" POST "/v1/users" @{
    email="testuser_${ts}@seasmp.uz"; password="Teacher@1234"
    firstName="Test"; lastName="User"; role="TEACHER"
} $AT 201

req "POST /users (duplicate email)"  POST "/v1/users" @{
    email="admin@seasmp.uz"; password="Admin@1234"; firstName="X"; lastName="X"; role="ADMIN"
} $AT -expectStatus 409

req "POST /users (invalid role)"     POST "/v1/users" @{
    email="x${ts}@x.com"; password="pass12345"; firstName="X"; lastName="X"; role="BADROL"
} $AT -expectStatus 400

req "GET /users/:id"           GET   "/v1/users/$adminId" -token $AT
req "PATCH /users/:id"         PATCH "/v1/users/$adminId" @{ firstName="Aziz"; lastName="Karimov" } $AT
req "PATCH /users/me"          PATCH "/v1/users/me" @{ firstName="Aziz" } $AT
req "PATCH /users/me/password (wrong old)" PATCH "/v1/users/me/password" @{
    oldPassword="wrongpass"; newPassword="Admin@9999"
} $AT -expectStatus 400

if ($newU) {
    req "PATCH /users/:id/toggle-status" PATCH "/v1/users/$($newU.data.id)/toggle-status" -token $AT
}

# ── 5. Courses ────────────────────────────────────────────────────────────────
Write-Host "`n[5. Courses]" -ForegroundColor Yellow
req "GET /courses (admin)"   GET "/v1/courses" -token $AT
req "GET /courses (student)" GET "/v1/courses" -token $ST
req "GET /courses (teacher)" GET "/v1/courses" -token $TT
req "GET /courses/:id"       GET "/v1/courses/$c1Id" -token $AT

# Course mutation tests — use a separate variable so $c1Id stays clean
$testC = req "POST /courses (teacher)" POST "/v1/courses" @{
    title="TestKurs_${ts}"; category="IT"; teacherId=$teacherId
    durationWeeks=4; price=0; maxStudents=5
    schedule=@{ days=@("Monday"); time="10:00"; room="Z-1" }
} $TT 201
req "POST /courses (wrong teacherId)" POST "/v1/courses" @{
    title="Bad"; category="IT"; teacherId=$adminId; durationWeeks=2
} $TT -expectStatus 403

if ($testC) {
    $testCId = $testC.data.id
    req "PATCH /courses/:id (teacher)"     PATCH  "/v1/courses/$testCId" @{ title="Updated_${ts}" } $TT
    req "PATCH /courses/:id/status"        PATCH  "/v1/courses/$testCId/status" @{ status="ACTIVE" } $AT
    req "DELETE /courses/:id (admin)"      DELETE "/v1/courses/$testCId" -token $AT
}

# ── 6. Enrollments ────────────────────────────────────────────────────────────
Write-Host "`n[6. Enrollments]" -ForegroundColor Yellow
req "GET /enrollments (admin)"          GET  "/v1/enrollments"             -token $AT
req "GET /enrollments (student)"        GET  "/v1/enrollments"             -token $ST
req "GET /enrollments (teacher)"        GET  "/v1/enrollments"             -token $TT
req "GET /enrollments?status=ACTIVE"    GET  "/v1/enrollments?status=ACTIVE" -token $AT
req "GET /enrollments/:id (admin)"      GET  "/v1/enrollments/$enr1Id"     -token $AT
req "GET /enrollments/:id (student own)" GET "/v1/enrollments/$enr1Id"    -token $ST

req "POST /enrollments (duplicate)"     POST "/v1/enrollments" @{
    studentId=$studentId; courseId=$c1Id
} $AT -expectStatus 409
req "POST /enrollments (teacher forbid)" POST "/v1/enrollments" @{
    studentId=$studentId; courseId=$c1Id
} $TT -expectStatus 403

# ── 7. Attendance ─────────────────────────────────────────────────────────────
Write-Host "`n[7. Attendance]" -ForegroundColor Yellow
req "GET /attendance (teacher)" GET "/v1/attendance" -token $TT
req "GET /attendance (student)" GET "/v1/attendance" -token $ST
req "GET /attendance (admin)"   GET "/v1/attendance" -token $AT

$attDate = (Get-Date "2200-01-01").AddDays($ts % 50000).ToString("yyyy-MM-dd")  # unique per run
$att   = req "POST /attendance (teacher marks PRESENT)" POST "/v1/attendance" @{
    enrollmentId=$enr1Id; lessonDate=$attDate; status="PRESENT"
} $TT 201

req "POST /attendance (duplicate)"         POST "/v1/attendance" @{
    enrollmentId=$enr1Id; lessonDate=$attDate; status="ABSENT"
} $TT -expectStatus 409

req "POST /attendance (student forbidden)" POST "/v1/attendance" @{
    enrollmentId=$enr1Id; lessonDate="2099-12-01"; status="PRESENT"
} $ST -expectStatus 403

req "GET /attendance/stats/:id (teacher)" GET "/v1/attendance/stats/$enr1Id" -token $TT
req "GET /attendance/stats/:id (student)" GET "/v1/attendance/stats/$enr1Id" -token $ST

$qrDate = (Get-Date "2300-01-01").AddDays($ts % 50000).ToString("yyyy-MM-dd")  # unique per run, different base from attDate
$qr = req "POST /attendance/qr/generate" POST "/v1/attendance/qr/generate" @{
    courseId=$c1Id; lessonDate=$qrDate
} $TT
if ($qr) {
    req "POST /attendance/qr/mark (student scan)" POST "/v1/attendance/qr/mark" @{ token=$qr.data.token } $ST 201
    req "POST /attendance/qr/mark (reuse token)"  POST "/v1/attendance/qr/mark" @{ token=$qr.data.token } $ST -expectStatus 400
}
req "POST /attendance/qr/generate (student forbid)" POST "/v1/attendance/qr/generate" @{
    courseId=$c1Id; lessonDate="2099-02-01"
} $ST -expectStatus 403

# ── 8. Assessments & Grades ───────────────────────────────────────────────────
Write-Host "`n[8. Assessments & Grades]" -ForegroundColor Yellow
req "GET /assessments/course/:id (teacher)" GET "/v1/assessments/course/$c1Id" -token $TT
req "GET /assessments/course/:id (student)" GET "/v1/assessments/course/$c1Id" -token $ST
req "GET /assessments/course/:id (admin)"   GET "/v1/assessments/course/$c1Id" -token $AT

$na = req "POST /assessments (teacher)" POST "/v1/assessments" @{
    courseId=$c1Id; title="Sinov_${ts}"; type="QUIZ"; maxScore=100; weight=0.2
} $TT 201
req "POST /assessments (student forbid)" POST "/v1/assessments" @{
    courseId=$c1Id; title="X"; type="QUIZ"
} $ST -expectStatus 403

if ($na) {
    $naId = $na.data.id
    req "PATCH /assessments/:id"           PATCH  "/v1/assessments/$naId" @{ title="Updated_${ts}"; maxScore=80 } $TT
    req "GET /assessments/:id/grades (empty)"   GET "/v1/assessments/$naId/grades" -token $TT

    req "POST /assessments/:id/grades (submit)" POST "/v1/assessments/$naId/grades" @{
        enrollmentId=$enr1Id; score=75; feedback="Yaxshi!"
    } $TT 201
    req "POST /assessments/:id/grades (update)" POST "/v1/assessments/$naId/grades" @{
        enrollmentId=$enr1Id; score=80; feedback="A'lo!"
    } $TT 201
    req "POST /assessments/:id/grades (over max)" POST "/v1/assessments/$naId/grades" @{
        enrollmentId=$enr1Id; score=999
    } $TT -expectStatus 400

    req "GET /assessments/:id/grades (teacher)"    GET "/v1/assessments/$naId/grades" -token $TT
    req "GET /assessments/:id/grades (student own)" GET "/v1/assessments/$naId/grades" -token $ST
    req "DELETE /assessments/:id"                  DELETE "/v1/assessments/$naId" -token $TT
}

# ── 9. Analytics ──────────────────────────────────────────────────────────────
Write-Host "`n[9. Analytics]" -ForegroundColor Yellow
req "GET /analytics/dashboard (admin)"          GET "/v1/analytics/dashboard"             -token $AT
req "GET /analytics/dashboard (teacher forbid)" GET "/v1/analytics/dashboard"             -token $TT -expectStatus 403
req "GET /analytics/courses/:id (teacher)"      GET "/v1/analytics/courses/$c1Id"         -token $TT
req "GET /analytics/courses/:id (admin)"        GET "/v1/analytics/courses/$c1Id"         -token $AT
req "GET /analytics/students/:id (student own)" GET "/v1/analytics/students/$studentId"   -token $ST
req "GET /analytics/students/:id (admin)"       GET "/v1/analytics/students/$studentId"   -token $AT
req "GET /analytics/students/:id (other forbid)" GET "/v1/analytics/students/$adminId"    -token $ST -expectStatus 403
req "GET /analytics/attendance (admin)"         GET "/v1/analytics/attendance"             -token $AT
req "GET /analytics/attendance?courseId"        GET "/v1/analytics/attendance?courseId=$c1Id" -token $TT

# ── 10. Security ──────────────────────────────────────────────────────────────
Write-Host "`n[10. Security]" -ForegroundColor Yellow
req "GET /security/audit-logs (admin)"          GET  "/v1/security/audit-logs"               -token $AT
req "GET /security/audit-logs?action=LOGIN"     GET  "/v1/security/audit-logs?action=LOGIN"  -token $AT
req "GET /security/audit-logs?resource=courses" GET  "/v1/security/audit-logs?resource=courses" -token $AT
req "GET /security/audit-logs (student forbid)" GET  "/v1/security/audit-logs"               -token $ST -expectStatus 403
req "GET /security/sessions (admin)"            GET  "/v1/security/sessions"                 -token $AT
req "GET /security/sessions (student)"          GET  "/v1/security/sessions"                 -token $ST
req "POST /security/cleanup (admin)"            POST "/v1/security/cleanup"                  -token $AT
req "POST /security/cleanup (student forbid)"   POST "/v1/security/cleanup"                  -token $ST -expectStatus 403

# ── 11. 2FA & Logout ──────────────────────────────────────────────────────────
Write-Host "`n[11. Auth - 2FA and Logout]" -ForegroundColor Yellow
req "GET /auth/2fa/setup (authenticated)"   GET  "/v1/auth/2fa/setup" -token $AT
req "GET /auth/2fa/setup (unauthenticated)" GET  "/v1/auth/2fa/setup" -expectStatus 401
req "POST /auth/logout"                     POST "/v1/auth/logout"     -token $AT

# ── Summary ───────────────────────────────────────────────────────────────────
$total = $pass + $fail
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Results: $pass / $total passed" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })
if ($fail -gt 0) { Write-Host "  $fail test(s) FAILED -- see red lines above" -ForegroundColor Red }
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

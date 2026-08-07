# version.txt 로컬 수집기 (Windows)
#
# 하는 일
#   이 PC 에서 베타 PartnerAdmin 의 version.txt 를 받아
#   배포 루트의 version-cache\beta-partneradmin.json 으로 저장하고,
#   내용이 바뀐 경우에만 커밋·푸시합니다. Vercel 이 배포하면 대시보드가 그 값을 읽습니다.
#
# 왜 PC 에서 하나
#   GitHub Actions 와 Vercel(둘 다 미국)은 이 서버에 TCP 연결조차 되지 않습니다.
#   반면 이 PC 는 브라우저로 잘 열리므로, 접속 가능한 곳에서 대신 받아옵니다.
#
# 설정
#   $RepoPath       : clone 한 저장소 폴더
#   $ProjectSubPath : Vercel 배포 루트 (api 폴더와 index.html 이 있는 폴더)
#                     저장소 최상위가 곧 배포 루트라면 "" 로 두세요
#
# 실행
#   powershell -ExecutionPolicy Bypass -File collect-local.ps1
#
# 자동 실행 (작업 스케줄러)
#   프로그램 : powershell
#   인수     : -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\경로\collect-local.ps1"
#   트리거   : 매일 시작, 15분마다 반복
#
# 주의
#   이 파일은 반드시 UTF-8 (BOM 포함) 으로 저장해야 합니다.
#   BOM 이 없으면 PowerShell 5.1 이 한글을 잘못 읽어 문법 오류가 납니다.

$RepoPath       = "C:\Users\k\Desktop\Squad\BetaPartner"
$ProjectSubPath = "version"
$Branch         = "main"

# 베타 PartnerAdmin 만 수집합니다.
# 나머지 어드민은 대시보드가 직접 조회에 성공하고 있어 스냅샷이 필요 없습니다.
# 나중에 다른 곳도 막히면 아래에 한 줄 추가하고, builds.js 의 해당 소스에
# { type: 'file', path: 'version-cache/<이름>.json' } 경로를 넣으면 됩니다.
$Targets = @(
  @{ Name = "beta-partneradmin";  Url = "https://stbtnpartners.startsupport.com/version.txt" }
)

if (-not (Test-Path $RepoPath)) {
  Write-Host "저장소 폴더를 찾을 수 없습니다: $RepoPath" -ForegroundColor Red
  exit 1
}
Set-Location $RepoPath

if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
  Write-Host "git 저장소가 아닙니다: $RepoPath" -ForegroundColor Red
  exit 1
}

$ProjectRoot = if ([string]::IsNullOrWhiteSpace($ProjectSubPath)) { $RepoPath }
               else { Join-Path $RepoPath $ProjectSubPath }

if (-not (Test-Path $ProjectRoot)) {
  Write-Host "배포 루트 폴더를 찾을 수 없습니다: $ProjectRoot" -ForegroundColor Red
  exit 1
}

$CacheDir = Join-Path $ProjectRoot "version-cache"
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

Write-Host "저장소     : $RepoPath"
Write-Host "스냅샷 위치 : $CacheDir"
Write-Host ""

git pull --rebase --autostash origin $Branch 2>&1 | Out-Null

$changed = $false

foreach ($t in $Targets) {
  $out = Join-Path $CacheDir ($t.Name + ".json")
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $url = $t.Url + "?_=" + $stamp

  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 `
             -Headers @{ "Cache-Control" = "no-cache"; "Accept" = "application/json, text/plain, */*" }
    $body = $res.Content
  } catch {
    Write-Host ("{0,-20} 실패: {1}" -f $t.Name, $_.Exception.Message) -ForegroundColor Yellow
    continue
  }

  if (Test-Path $out) {
    try { $old = (Get-Content $out -Raw -Encoding UTF8 | ConvertFrom-Json).body } catch { $old = "" }
    if ($old -eq $body) {
      Write-Host ("{0,-20} 내용 동일 - 건너뜀" -f $t.Name) -ForegroundColor DarkGray
      continue
    }
  }

  $snapshot = [ordered]@{
    fetchedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    status    = 200
    body      = $body
  }
  $snapshot | ConvertTo-Json -Depth 5 | Set-Content -Path $out -Encoding UTF8
  Write-Host ("{0,-20} 갱신함" -f $t.Name) -ForegroundColor Green
  $changed = $true
}

Write-Host ""

if (-not $changed) {
  Write-Host "변경 없음 - 커밋하지 않습니다."
  exit 0
}

git add -- "$CacheDir"
git commit -m ("version-cache 갱신 " + (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
git push origin $Branch

if ($LASTEXITCODE -eq 0) {
  Write-Host "푸시 완료. Vercel 배포 후 대시보드에 반영됩니다." -ForegroundColor Green
} else {
  Write-Host "푸시 실패. git 인증 상태를 확인하세요." -ForegroundColor Red
}
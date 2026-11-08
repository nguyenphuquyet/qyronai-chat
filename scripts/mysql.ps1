param(
  [ValidateSet("start", "stop", "status")]
  [string]$Action = "start"
)

$base = "C:\Program Files\MySQL\MySQL Server 8.4"
$data = Join-Path $env:LOCALAPPDATA "qyron-mysql"
$mysqld = Join-Path $base "bin\mysqld.exe"
$mysqladmin = Join-Path $base "bin\mysqladmin.exe"

function Test-MySqlPort {
  return (Test-NetConnection 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue)
}

switch ($Action) {
  "start" {
    if (Test-MySqlPort) {
      Write-Host "MySQL đang chạy ở 127.0.0.1:3306."
      break
    }
    if (-not (Test-Path $data)) {
      Write-Error "Chưa có dữ liệu MySQL tại $data. Chạy prisma db push lại sau khi tạo thư mục."
      exit 1
    }
    Start-Process -FilePath $mysqld -ArgumentList @(
      "--basedir=`"$base`"",
      "--datadir=`"$data`"",
      "--port=3306",
      "--bind-address=127.0.0.1",
      "--mysqlx=0"
    ) -WindowStyle Hidden
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 500
      if ((Get-Process mysqld -ErrorAction SilentlyContinue) -and (Test-MySqlPort)) {
        Write-Host "MySQL đã sẵn sàng ở 127.0.0.1:3306."
        exit 0
      }
    }
    Write-Error "MySQL chưa sẵn sàng sau 10 giây."
    exit 1
  }
  "stop" {
    & $mysqladmin -u root -ppassword -h 127.0.0.1 shutdown
    Write-Host "Đã dừng MySQL."
  }
  "status" {
    if (Test-MySqlPort) {
      Write-Host "MySQL đang chạy."
    } else {
      Write-Host "MySQL đang tắt."
    }
  }
}

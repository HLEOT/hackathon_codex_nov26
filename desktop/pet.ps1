param([string]$BaseUrl='http://localhost:3000',[switch]$BuildOnly,[switch]$Walk)
$ErrorActionPreference='Stop'
$daytownRoot=Split-Path -Parent $PSScriptRoot
$daytownRuntime=Join-Path $daytownRoot 'runtime'
New-Item -ItemType Directory -Force -Path $daytownRuntime | Out-Null
$daytownSource=Join-Path $PSScriptRoot 'PetOverlay.cs'
$daytownExecutable=Join-Path $daytownRuntime 'DaytownPet.exe'
try {
 if(-not (Test-Path -LiteralPath $daytownExecutable) -or (Get-Item -LiteralPath $daytownSource).LastWriteTimeUtc -gt (Get-Item -LiteralPath $daytownExecutable).LastWriteTimeUtc) {
  Add-Type -TypeDefinition ([System.IO.File]::ReadAllText($daytownSource)) -Language CSharp -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll' -OutputAssembly $daytownExecutable -OutputType WindowsApplication
 }
 if($BuildOnly){Write-Output "Built $daytownExecutable";exit 0}
 $daytownArgs=@($BaseUrl);if($Walk){$daytownArgs+='--walk'}
 Start-Process -FilePath $daytownExecutable -ArgumentList $daytownArgs -WorkingDirectory $daytownRoot -WindowStyle Hidden | Out-Null
} catch {
 Add-Content -LiteralPath (Join-Path $daytownRuntime 'native-pet.log') -Value ($_.Exception.GetType().Name+': '+$_.Exception.Message)
 throw
}

; Ada Chat Installer Script for Inno Setup 6
; Packages the Ada Chat PHP web application into a Windows one-click installer

#define MyAppName "Ada Chat"
#define MyAppVersion "1.0.3"
#define MyAppPublisher "Ada Chat"
#define MyAppURL "https://github.com/AdaChat"
#define MyAppExeName "start.bat"

[Setup]
AppId={{A3D2C1B0-E4F5-6789-ABCD-EF0123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist
OutputBaseFilename=AdaChat_Setup_v{#MyAppVersion}
SetupIconFile=compiler:SetupClassicIcon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=6.3
DisableProgramGroupPage=yes
LicenseFile=LICENSE
InfoAfterFile=使用说明.txt
WizardImageFile=compiler:WizClassicImage.bmp
WizardSmallImageFile=compiler:WizClassicSmallImage.bmp

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; VC++ Redistributable (extracted to temp, installed if needed)
Source: "vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

; Main application files
Source: "AI.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "ai_config.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "ai_proxy.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "api.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "cost_optimizer.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "login.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "script.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "style.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "使用说明.txt"; DestDir: "{app}"; Flags: ignoreversion

; Launcher scripts
Source: "start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "router.php"; DestDir: "{app}"; Flags: ignoreversion

; Data directories
Source: "ai_data\*"; DestDir: "{app}\ai_data"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "plugins\*"; DestDir: "{app}\plugins"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "ssl\*"; DestDir: "{app}\ssl"; Flags: ignoreversion recursesubdirs createallsubdirs

; Bundled PHP runtime
Source: "php\*"; DestDir: "{app}\php"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Launch Ada Chat"
Name: "{group}\Stop {#MyAppName}"; Filename: "{app}\stop.bat"; Comment: "Stop Ada Chat Server"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; Comment: "Launch Ada Chat"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Ada Chat"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
Filename: "{app}\stop.bat"; Flags: runhidden; RunOnceId: "StopServer"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\ai_data"

[Code]
function IsVCRedistInstalled: Boolean;
var
  RegKey: String;
  InstallValue: Cardinal;
begin
  Result := False;
  RegKey := 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64';
  if RegQueryDWordValue(HKLM, RegKey, 'Installed', InstallValue) then
    Result := (InstallValue = 1);
end;

function InitializeSetup(): Boolean;
begin
  if not IsWin64 then
  begin
    MsgBox('Ada Chat requires 64-bit Windows (x64).' + #13#10 +
           'Ada Chat 需要 64 位 Windows 系统。', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    if not DirExists(ExpandConstant('{app}\ai_data')) then
      CreateDir(ExpandConstant('{app}\ai_data'));

    if not IsVCRedistInstalled then
    begin
      WizardForm.StatusLabel.Caption := 'Installing Visual C++ Runtime...';
      WizardForm.StatusLabel.Caption := '正在安装 Visual C++ 运行库...';
      Exec(ExpandConstant('{tmp}\vc_redist.x64.exe'),
           '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;

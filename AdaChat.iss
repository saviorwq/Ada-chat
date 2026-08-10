; Ada Chat Installer Script for Inno Setup 6
; Packages the Ada Chat PHP web application into a Windows one-click installer

#define MyAppName "Ada Chat"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "Ada Chat"
#define MyAppURL "https://github.com/AdaChat"
#define MyAppExeName "启动 Ada Chat.bat"

[Setup]
AppId={{A3D2C1B0-E4F5-6789-ABCD-EF0123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=release
OutputBaseFilename=AdaChat_Setup_v{#MyAppVersion}
SetupIconFile=assets\adachat-logo.ico
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
Source: "vchat.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "vite-manifest.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "gate_check.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "style.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "使用说明.txt"; DestDir: "{app}"; Flags: ignoreversion

; Launcher scripts（小白主入口：「启动 Ada Chat.bat」；start.bat 为兼容转调）
Source: "启动 Ada Chat.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "停止 Ada Chat.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "router.php"; DestDir: "{app}"; Flags: ignoreversion
Source: "AdaChatTray.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "AdaChatTray.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-adachat.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-hidden.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion

; 本地推理桥接（文生图 / 本地 LLM doctor / 视频）
Source: "image_inference_bridge.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "local_inference_bridge.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "video_inference_bridge.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "requirements.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "requirements-local-image.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "requirements-local-inference.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "requirements-local-video.txt"; DestDir: "{app}"; Flags: ignoreversion

; 品牌资源（托盘图标 / 登录页 logo）
Source: "assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; llama-vulkan 启停脚本（二进制由 ensure 脚本按需下载）
Source: "tools\llama-vulkan\*.ps1"; DestDir: "{app}\tools\llama-vulkan"; Flags: ignoreversion
Source: "tools\llama-vulkan\*.cmd"; DestDir: "{app}\tools\llama-vulkan"; Flags: ignoreversion
Source: "tools\llama-vulkan\README.md"; DestDir: "{app}\tools\llama-vulkan"; Flags: ignoreversion

; Vite 生产构建（必须先 npm run build 生成 dist/，否则 AI.php 无法加载）
Source: "dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

; Data directories（plugins 仅打示例插件，排除本地 cyoa/node_modules 开发目录）
Source: "ai_data\.htaccess"; DestDir: "{app}\ai_data"; Flags: ignoreversion skipifsourcedoesntexist
Source: "ai_data\.gitkeep"; DestDir: "{app}\ai_data"; Flags: ignoreversion skipifsourcedoesntexist
Source: "plugins\example-hello\*"; DestDir: "{app}\plugins\example-hello"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist; Excludes: "node_modules,\.git"
Source: "ssl\*"; DestDir: "{app}\ssl"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Bundled PHP runtime
Source: "php\*"; DestDir: "{app}\php"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Launch Ada Chat"
Name: "{group}\{#MyAppName}（托盘）"; Filename: "{app}\AdaChatTray.bat"; Comment: "Tray launcher (portable)"
Name: "{group}\停止 {#MyAppName}"; Filename: "{app}\停止 Ada Chat.bat"; Comment: "Stop Ada Chat Server"
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

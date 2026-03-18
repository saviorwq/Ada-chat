' Ada Chat - 默认启动方式（无窗口，任务栏也不显示）
' 双击此文件启动，点击「安全退出」后会自动关闭 PHP 进程
' 若连接失败，请改用 start.bat 或 start-minimized.vbs（调试用）
Option Explicit
Dim fso, WshShell, ScriptDir, psScript

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = ScriptDir & "\start-hidden.ps1"

' 使用 PowerShell 完全隐藏启动 PHP，0 = 隐藏 VBS 自身
WshShell.Run "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """", 0, False

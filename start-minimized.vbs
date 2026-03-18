' Ada Chat - 最小化启动（PHP 窗口最小化到任务栏）
' 若 start-hidden.vbs 连接失败，可改用此文件（窗口在任务栏，可点击查看日志）
Option Explicit
Dim fso, WshShell, ScriptDir

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "cmd /c start ""Ada Chat"" /min cmd /c ""cd /d """" & ScriptDir & """" && start.bat""", 0, False

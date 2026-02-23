<?php
/**
 * Ada Chat 登录页面
 * 首次使用请修改下方密码
 */
session_name('ADASESSID');
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_samesite', 'Lax');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', 1);
}
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// ============ 配置 ============
// 首次部署请修改此密码，或改为从环境变量读取
// 支持环境变量 ADA_LOGIN_PASSWORD，优先使用
define('LOGIN_PASSWORD', getenv('ADA_LOGIN_PASSWORD') ?: 'admin123');
// ==============================

// CSRF Token 生成
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrfToken = $_POST['_csrf_token'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'] ?? '', $csrfToken)) {
        $error = '请求验证失败，请刷新页面重试';
    } else {
        $password = $_POST['password'] ?? '';
        if ($password === LOGIN_PASSWORD) {
            $_SESSION['loggedin'] = true;
            header('Location: AI.php');
            exit;
        } else {
            $error = '密码错误';
        }
    }
}

if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: login.php');
    exit;
}

if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true) {
    header('Location: AI.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ada Chat - 登录</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            color: #e2e8f0;
        }
        .login-card {
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 16px;
            padding: 48px 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
        }
        .login-card h1 {
            font-size: 28px;
            font-weight: 700;
            text-align: center;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #10b981, #34d399);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .login-card p {
            text-align: center;
            color: #94a3b8;
            font-size: 14px;
            margin-bottom: 32px;
        }
        .form-group { margin-bottom: 24px; }
        .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #cbd5e1;
        }
        .form-group input {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid rgba(148, 163, 184, 0.2);
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.6);
            color: #e2e8f0;
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
        }
        .form-group input:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
        .login-btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s, box-shadow 0.2s;
        }
        .login-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
        }
        .login-btn:active { transform: translateY(0); }
        .error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 14px;
            margin-bottom: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>Ada Chat</h1>
        <p>多模态 AI 助手</p>
        <?php if ($error): ?>
            <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <form method="POST" action="">
            <input type="hidden" name="_csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token']) ?>">
            <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" placeholder="请输入访问密码" autofocus required>
            </div>
            <button type="submit" class="login-btn">登录</button>
        </form>
    </div>
</body>
</html>

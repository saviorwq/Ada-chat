<?php
/**
 * PHP built-in server router
 * Blocks direct web access to sensitive directories
 */

$uri = urldecode($_SERVER['REQUEST_URI']);
$path = parse_url($uri, PHP_URL_PATH);

$blocked = ['/ai_data/', '/ssl/', '/php/'];
foreach ($blocked as $dir) {
    if (stripos($path, $dir) === 0 || stripos($path, $dir) !== false) {
        http_response_code(403);
        echo '403 Forbidden';
        return true;
    }
}

if ($path !== '/' && file_exists(__DIR__ . $path)) {
    return false;
}

return false;

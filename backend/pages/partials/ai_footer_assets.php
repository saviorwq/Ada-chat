    <!-- 完整前端：仅 Vite full 单包（见上方 PHP：无 dist 则已 503 退出） -->
    <?php foreach ($viteFull['css'] as $cssHref): ?>
    <?php
      if (!is_string($cssHref) || $cssHref === '') {
          continue;
      }
      $cssDisk = $workspaceRoot . '/' . $cssHref;
      $cssV = is_file($cssDisk) ? filemtime($cssDisk) : time();
    ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($cssHref, ENT_QUOTES, 'UTF-8') ?>?v=<?= (int) $cssV ?>">
    <?php endforeach; ?>
    <?php
      $fullJsV = is_file($viteFullJsPath) ? filemtime($viteFullJsPath) : time();
    ?>
    <script type="module" src="<?= htmlspecialchars($viteFull['js'], ENT_QUOTES, 'UTF-8') ?>?v=<?= (int) $fullJsV ?>"></script>

    <?php require $workspaceRoot . '/backend/pages/ai_assets.php'; ?>
</body>
</html>

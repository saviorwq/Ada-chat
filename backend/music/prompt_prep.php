<?php
/* Copyright (c) Ada Chat contributors | SPDX-License-Identifier: GPL-3.0-only */
declare(strict_types=1);

/**
 * ACE-Step 提示词/元数据预处理：补 BPM、拍号、[Instrumental]，减少「无节奏糊成一团」
 * Prep caption/lyrics/BPM so DiT gets a clear pulse instead of mushy ambient soup
 */

/**
 * 去掉 UI 分类前缀 / Strip UI category markers
 */
function adachat_music_strip_category_markers(string $text): string
{
    $out = preg_replace('/^(?:\s*\[文生音乐\]\s*)+/u', '', trim($text));
    return trim((string) ($out ?? $text));
}

/**
 * 从描述推断 BPM；用户指定优先
 * Infer BPM from caption; explicit user value wins
 */
function adachat_music_infer_bpm(string $caption, $userBpm = null): int
{
    if (is_numeric($userBpm)) {
        $b = (int) $userBpm;
        if ($b >= 30 && $b <= 300) {
            return $b;
        }
    }
    // 文案里已写 bpm
    if (preg_match('/\b(\d{2,3})\s*bpm\b/i', $caption, $m)) {
        $b = (int) $m[1];
        if ($b >= 30 && $b <= 300) {
            return $b;
        }
    }
    $c = mb_strtolower($caption, 'UTF-8');
    if (preg_match('/vinahouse|edm|techno|trance|dnb|drum\s*and\s*bass|蹦迪|电音|热舞|夜店/u', $c)) {
        return 128;
    }
    if (preg_match('/house|disco|dance|电子舞曲/u', $c)) {
        return 124;
    }
    if (preg_match('/rock|metal|punk|funk|pop\b|流行/u', $c)) {
        return 118;
    }
    if (preg_match('/hip.?hop|trap|rap|说唱/u', $c)) {
        return 92;
    }
    if (preg_match('/ballad|lullaby|slow|慢歌|抒情|安眠|轻柔/u', $c)) {
        return 72;
    }
    if (preg_match('/ambient|cinematic|atmosphere|氛围|古风|国风|wuxia|武侠|禅|笛|筝|二胡/u', $c)) {
        return 88;
    }
    return 100;
}

/**
 * 是否应按纯器乐处理
 *
 * @param array{instrumental_only?:bool|int|string,instrumental?:bool|int|string} $extra
 */
function adachat_music_is_instrumental_request(string $caption, string $lyrics, array $extra = []): bool
{
    // UI「仅音乐」勾选：强制纯器乐（忽略歌词块）
    if (!empty($extra['instrumental_only']) || !empty($extra['force_instrumental'])) {
        return true;
    }
    if (array_key_exists('instrumental', $extra) && $extra['instrumental'] !== null && $extra['instrumental'] !== '') {
        $v = $extra['instrumental'];
        if ($v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'yes') {
            return true;
        }
        if ($v === false || $v === 0 || $v === '0' || $v === 'false' || $v === 'no') {
            return false;
        }
    }
    $ly = trim($lyrics);
    if ($ly === '') {
        return true;
    }
    $low = mb_strtolower($ly, 'UTF-8');
    if ($low === '[instrumental]' || $low === '[inst]') {
        return true;
    }
    if (preg_match('/纯器乐|无人声|无歌词|仅音乐|no\s*vocals|instrumental\s*only|music\s*only/iu', $caption)) {
        // 用户写了歌词块则仍以歌词为准（除非 UI 强制仅音乐）
        if (!preg_match('/\[verse\]|\[chorus\]|\[主歌\]|\[副歌\]/iu', $ly)
            && mb_strlen(preg_replace('/\[[^\]]*\]/', '', $ly) ?? '') < 8) {
            return true;
        }
    }
    return false;
}

/**
 * 「仅音乐」模式追加的默认提示词标签
 */
function adachat_music_instrumental_only_tags(): string
{
    return 'instrumental, no vocals, pure instrumental, music only, no singing, 纯器乐, 无人声, 仅音乐';
}

/**
 * 组装 ACE release_task 用的 caption / lyrics / bpm / time_signature
 *
 * @param array{bpm?:int|string|null,instrumental_only?:bool|int|string,instrumental?:bool|int|string} $extra
 * @return array{caption:string,lyrics:string,bpm:int,time_signature:string,instrumental:bool}
 */
function adachat_music_prepare_ace_conditioning(string $caption, string $lyrics, array $extra = []): array
{
    $caption = adachat_music_strip_category_markers($caption);
    $lyrics = trim($lyrics);
    $forceOnly = !empty($extra['instrumental_only']) || !empty($extra['force_instrumental']);
    $instrumental = adachat_music_is_instrumental_request($caption, $lyrics, $extra);
    $bpm = adachat_music_infer_bpm($caption, $extra['bpm'] ?? null);

    // 官方：纯器乐 lyrics 必须是 [Instrumental]（或空）；结构化长歌词会让 is_instrumental=false
    if ($instrumental) {
        $lyrics = '[Instrumental]';
        if ($forceOnly) {
            // UI 勾选「仅音乐」：补全一套稳定无人声标签
            if (!preg_match('/pure instrumental|music only|仅音乐|纯器乐/iu', $caption)) {
                $caption .= ', ' . adachat_music_instrumental_only_tags();
            } elseif (!preg_match('/instrumental|no vocals|无人声/iu', $caption)) {
                $caption .= ', instrumental, no vocals';
            }
        } elseif (!preg_match('/instrumental|no vocals|纯器乐|无人声|无歌词|仅音乐/iu', $caption)) {
            $caption .= ', instrumental, no vocals';
        }
    }

    if (!preg_match('/\b\d{2,3}\s*bpm\b/i', $caption)) {
        $caption .= ', ' . $bpm . ' bpm';
    }
    if (!preg_match('/\b4\s*\/\s*4\b|四四拍|4\/4/u', $caption)) {
        $caption .= ', 4/4';
    }
    // 除非用户明确不要鼓点，否则加「稳定节拍」标签，避免氛围词把节奏冲掉
    if (!preg_match('/drone|no beat|no drums|无鼓点|无节奏|无拍子/iu', $caption)
        && !preg_match('/steady (tempo|beat|groove)|clear (beat|rhythm)|律动强|节拍清晰|强劲.*拍/iu', $caption)) {
        $caption .= ', steady tempo, clear rhythmic pulse';
    }

    $caption = trim(preg_replace('/\s+,/', ',', $caption) ?? $caption);
    $caption = trim(preg_replace('/,\s*,+/', ',', $caption) ?? $caption);

    return [
        'caption' => $caption,
        'lyrics' => $lyrics,
        'bpm' => $bpm,
        'time_signature' => '4',
        'instrumental' => $instrumental,
    ];
}

/**
 * Cover 纯伴奏：只强化 caption 标签，lyrics 保持空（勿写 [Verse]）
 *
 * @param array{bpm?:int|string|null} $extra
 * @return array{caption:string,lyrics:string,bpm:int,time_signature:string,instrumental:bool}
 */
function adachat_music_prepare_ace_cover_caption(string $caption, array $extra = []): array
{
    $caption = adachat_music_strip_category_markers($caption);
    $bpm = adachat_music_infer_bpm($caption, $extra['bpm'] ?? null);
    if (!preg_match('/instrumental|no vocals|no humming|no singing|纯器乐|无人声|仅音乐/iu', $caption)) {
        $caption .= ', instrumental, no vocals, no humming, no singing, pure instrumental';
    }
    if (!preg_match('/\b\d{2,3}\s*bpm\b/i', $caption)) {
        $caption .= ', ' . $bpm . ' bpm';
    }
    if (!preg_match('/\b4\s*\/\s*4\b|四四拍|4\/4/u', $caption)) {
        $caption .= ', 4/4';
    }
    $caption = trim(preg_replace('/\s+,/', ',', $caption) ?? $caption);
    $caption = trim(preg_replace('/,\s*,+/', ',', $caption) ?? $caption);
    return [
        'caption' => $caption,
        'lyrics' => '',
        'bpm' => $bpm,
        'time_signature' => '4',
        'instrumental' => true,
    ];
}

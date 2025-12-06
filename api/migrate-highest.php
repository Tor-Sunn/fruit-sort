<?php
// migrate-highest.php – backfill a `highest` field for legacy records
// This script sets `highest` to null when missing, preserving existing ordering and truncation.
// Run from the api/ directory: php migrate-highest.php

header('Content-Type: application/json; charset=utf-8');

function backfill_highest($path, $daily = false) {
    if (!file_exists($path)) return ['ok' => false, 'error' => 'File not found: '.$path];
    $json = file_get_contents($path);
    $data = json_decode($json, true);
    if (!is_array($data)) return ['ok' => false, 'error' => 'Invalid JSON: '.$path];

    $changed = 0;
    if ($daily) {
        foreach ($data as $date => $arr) {
            if (!is_array($arr)) continue;
            foreach ($arr as &$row) {
                if (!array_key_exists('highest', $row)) {
                    $row['highest'] = null; // unknown historically
                    $changed++;
                }
                // Remove obsolete difficulty if present
                if (array_key_exists('difficulty', $row)) unset($row['difficulty']);
            }
            unset($row);
        }
    } else {
        foreach ($data as &$row) {
            if (!array_key_exists('highest', $row)) {
                $row['highest'] = null; // unknown historically
                $changed++;
            }
            if (array_key_exists('difficulty', $row)) unset($row['difficulty']);
        }
        unset($row);
    }

    // Re-save pretty JSON; preserve unicode
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return ['ok' => true, 'file' => $path, 'changed' => $changed];
}

$base = __DIR__;
$r1 = backfill_highest($base.'/fruit-scores.json', false);
$r2 = backfill_highest($base.'/fruit-scores-daily.json', true);

echo json_encode(['global' => $r1, 'daily' => $r2], JSON_UNESCAPED_UNICODE);

<?php
// get-fruit-daily.php – return list for given yyyymmdd date
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/fruit-scores-daily.json';
$date = isset($_GET['date']) ? $_GET['date'] : null; // yyyymmdd

if (!$date) {
    echo json_encode([]);
    exit;
}

if (!file_exists($file)) {
    echo json_encode([]);
    exit;
}

$json = file_get_contents($file);
$data = json_decode($json, true);
if (!is_array($data) || !isset($data[$date]) || !is_array($data[$date])) {
    echo json_encode([]);
    exit;
}

echo json_encode($data[$date], JSON_UNESCAPED_UNICODE);

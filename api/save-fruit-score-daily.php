<?php
// save-fruit-score-daily.php – save DAILY scores per date for Fruit Flow
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/fruit-scores-daily.json';

$name  = isset($_POST['name']) ? trim($_POST['name']) : 'Player';
$score = isset($_POST['score']) ? intval($_POST['score']) : 0;
$highest = isset($_POST['highest']) ? intval($_POST['highest']) : null; // optional highest fruit level
$platform = isset($_POST['platform']) ? $_POST['platform'] : null; // 'mobile' | 'desktop'
$size = isset($_POST['size']) ? $_POST['size'] : null; // e.g., '8x8'
$date  = isset($_POST['date']) ? $_POST['date'] : null; // format yyyymmdd

if ($score <= 0 || !$date) {
    echo json_encode(['ok' => false, 'error' => 'Missing score or date']);
    exit;
}

$data = [];
if (file_exists($file)) {
    $json = file_get_contents($file);
    $data = json_decode($json, true);
    if (!is_array($data)) $data = [];
}
if (!isset($data[$date]) || !is_array($data[$date])) {
    $data[$date] = [];
}

$entry = [
    'name'  => mb_substr($name, 0, 16),
    'score' => $score,
    'ts'    => time()
];
if ($highest !== null && $highest >= 0) {
    $entry['highest'] = $highest;
}
if ($platform) { $entry['platform'] = substr($platform, 0, 16); }
if ($size) { $entry['size'] = substr($size, 0, 8); }
$data[$date][] = $entry;

usort($data[$date], function($a, $b) {
    return $b['score'] <=> $a['score'];
});

$data[$date] = array_slice($data[$date], 0, 100);

file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true]);

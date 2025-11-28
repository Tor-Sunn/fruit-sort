<?php
// save-fruit-score-daily.php – save DAILY scores per date for Fruit Merge
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/fruit-scores-daily.json';

$name  = isset($_POST['name']) ? trim($_POST['name']) : 'Player';
$score = isset($_POST['score']) ? intval($_POST['score']) : 0;
$diff  = isset($_POST['diff']) ? $_POST['diff'] : 'normal';
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

$data[$date][] = [
    'name'       => mb_substr($name, 0, 16),
    'score'      => $score,
    'difficulty' => $diff,
    'ts'         => time()
];

usort($data[$date], function($a, $b) {
    return $b['score'] <=> $a['score'];
});

$data[$date] = array_slice($data[$date], 0, 100);

file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true]);

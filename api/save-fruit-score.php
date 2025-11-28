<?php
// save-fruit-score.php – save GLOBAL scores for Fruit Merge
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/fruit-scores.json';

$name  = isset($_POST['name']) ? trim($_POST['name']) : 'Player';
$score = isset($_POST['score']) ? intval($_POST['score']) : 0;
$diff  = isset($_POST['diff']) ? $_POST['diff'] : 'normal';

if ($score <= 0) {
    echo json_encode(['ok' => false, 'error' => 'Missing score']);
    exit;
}

$data = [];
if (file_exists($file)) {
    $json = file_get_contents($file);
    $data = json_decode($json, true);
    if (!is_array($data)) $data = [];
}

$data[] = [
    'name'       => mb_substr($name, 0, 16),
    'score'      => $score,
    'difficulty' => $diff,
    'ts'         => time()
];

usort($data, function($a, $b) {
    return $b['score'] <=> $a['score'];
});

$data = array_slice($data, 0, 100);

file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true]);

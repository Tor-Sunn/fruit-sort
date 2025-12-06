<?php
// save-fruit-score.php – save GLOBAL scores for Fruit Flow
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/fruit-scores.json';

$name  = isset($_POST['name']) ? trim($_POST['name']) : 'Player';
$score = isset($_POST['score']) ? intval($_POST['score']) : 0;
$highest = isset($_POST['highest']) ? intval($_POST['highest']) : null; // optional highest fruit level
$platform = isset($_POST['platform']) ? $_POST['platform'] : null; // 'mobile' | 'desktop'
$size = isset($_POST['size']) ? $_POST['size'] : null; // e.g., '8x8'

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
$data[] = $entry;

usort($data, function($a, $b) {
    return $b['score'] <=> $a['score'];
});

$data = array_slice($data, 0, 100);

file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true]);

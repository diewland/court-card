<?php
// Court Card forecast proxy. Calls the Thai Meteorological Department (TMD) NWP API with the
// token from tmd-config.php and returns the hourly forecast for the courts at Wachirabenchathat
// Park as {"time": ["2026-11-07T00", ...], "cond": [...], "temp": [...]} (Bangkok time).
// Browsers can't call TMD directly: it sends two Access-Control-Allow-Origin values, and the
// token must stay secret. TMD covers today through today+2, at most 48 hours per request.
// Upload this file and tmd-config.php (copied from tmd-config.sample.php) to the same folder.

const LAT = 13.8145;
const LON = 100.557;
const CACHE_SECONDS = 7200; // 72 hours x 2 fields per refresh; every 2h is ~52k datapoints a month

// No Access-Control-Allow-Origin here: the host (diewland.com) already adds
// "Access-Control-Allow-Origin: *" to every response, and a second value makes browsers reject it.
// On a host that doesn't, uncomment the next line.
// header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=1800');

date_default_timezone_set('Asia/Bangkok');
$today = date('Y-m-d');
$cache = sys_get_temp_dir() . '/court-card-tmd.json';
$cached = is_file($cache) ? filemtime($cache) : 0;

// Fresh means fetched today in the last 2 hours; a new day needs a new window.
if ($cached && date('Y-m-d', $cached) === $today && time() - $cached < CACHE_SECONDS) {
  readfile($cache);
  exit;
}

// On any failure, serve the old copy rather than nothing.
function fail($cache) {
  if (is_file($cache)) { readfile($cache); exit; }
  http_response_code(502);
  header('Cache-Control: no-store');
  echo '{"error":"forecast unavailable"}';
  exit;
}

function tmd($token, $date, $hours) {
  $ch = curl_init('https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at?' . http_build_query([
    'lat' => LAT, 'lon' => LON, 'fields' => 'tc,cond', 'date' => $date, 'hour' => 0, 'duration' => $hours,
  ]));
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_USERAGENT => 'CourtCard/1.0', // TMD's Cloudflare blocks some default agents
    CURLOPT_HTTPHEADER => ['Accept: application/json', 'Authorization: Bearer ' . $token],
  ]);
  $body = curl_exec($ch);
  $ok = $body !== false && curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200;
  curl_close($ch);
  $j = $ok ? json_decode($body, true) : null;
  return isset($j['WeatherForecasts'][0]['forecasts']) ? $j['WeatherForecasts'][0]['forecasts'] : null;
}

$config = @include __DIR__ . '/tmd-config.php';
if (empty($config['token'])) fail($cache);

// Today and tomorrow in one request, the day after in another.
$a = tmd($config['token'], $today, 48);
if ($a === null) fail($cache);
$b = tmd($config['token'], date('Y-m-d', strtotime('+2 days')), 24);

$out = ['time' => [], 'cond' => [], 'temp' => []];
foreach (array_merge($a, $b ?: []) as $f) {
  $out['time'][] = substr($f['time'], 0, 13); // "2026-11-07T18"
  $out['cond'][] = isset($f['data']['cond']) ? $f['data']['cond'] : null;
  $out['temp'][] = isset($f['data']['tc']) ? $f['data']['tc'] : null;
}
$json = json_encode($out);
@file_put_contents($cache, $json);
echo $json;

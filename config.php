<?php
define('SERVERS_FILE', '/usr/share/nginx/html/pg-monitor/servers.json');
define('USERS_FILE', '/usr/share/nginx/html/pg-monitor/users.json');

function load_json($file, $default = []) {
    if (!file_exists($file)) {
        file_put_contents($file, json_encode($default));
        chmod($file, 0600);
    }
    return json_decode(file_get_contents($file), true);
}

function save_json($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

function connect_to_db($server) {
    $conn = pg_connect("host={$server['host']} port={$server['port']} dbname=stats_db user={$server['user']} password={$server['password']}");
    if (!$conn) {
        throw new Exception("Не удалось подключиться к {$server['name']}: " . pg_last_error());
    }
    return $conn;
}
?>

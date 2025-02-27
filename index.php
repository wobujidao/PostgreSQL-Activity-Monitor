<?php
session_start();
require_once 'config.php';

// Обработка выхода
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: login.php');
    exit;
}

if (!isset($_SESSION['username'])) {
    header('Location: login.php');
    exit;
}

$servers = load_json(SERVERS_FILE, [
    "servers" => [["name" => "s00-dbs06", "host" => "10.110.125.61", "user" => "postgres", "password" => "", "port" => 5432]]
])['servers'];

// Обработка действий
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['add_server'])) {
        $new_server = [
            "name" => $_POST['name'],
            "host" => $_POST['host'],
            "user" => $_POST['user'],
            "password" => $_POST['password'],
            "port" => (int)$_POST['port']
        ];
        $servers[] = $new_server;
        save_json(SERVERS_FILE, ["servers" => $servers]);
        header('Location: index.php');
        exit;
    } elseif (isset($_POST['delete_server'])) {
        $server_name = $_POST['server_name'];
        $new_servers = [];
        foreach ($servers as $s) {
            if ($s['name'] !== $server_name) {
                $new_servers[] = $s;
            }
        }
        $servers = $new_servers;
        save_json(SERVERS_FILE, ["servers" => $servers]);
        header('Location: index.php');
        exit;
    } elseif (isset($_POST['edit_server'])) {
        $old_name = $_POST['old_name'];
        foreach ($servers as &$server) {
            if ($server['name'] === $old_name) {
                $server['name'] = $_POST['name'];
                $server['host'] = $_POST['host'];
                $server['user'] = $_POST['user'];
                $server['password'] = $_POST['password'];
                $server['port'] = (int)$_POST['port'];
                break;
            }
        }
        unset($server);
        save_json(SERVERS_FILE, ["servers" => $servers]);
        header('Location: index.php');
        exit;
    }
}

// Начало замера времени
$start_time = microtime(true);

// Получение данных о серверах
$server_details = [];
$last_update = '-';
foreach ($servers as $server) {
    try {
        $conn = connect_to_db($server);
        $result = pg_query($conn, "
            SELECT 
                disk_free_space,
                EXTRACT(EPOCH FROM (NOW() - pg_postmaster_start_time())) AS uptime_seconds,
                ts AS last_update
            FROM pg_statistics
            ORDER BY ts DESC
            LIMIT 1
        ");
        if (!$result) throw new Exception("Ошибка запроса: " . pg_last_error($conn));
        $row = pg_fetch_assoc($result);
        $last_update = $row['last_update'] ?: '-';

        $server_details[$server['name']] = [
            'disk_free_space' => $row['disk_free_space'] ? number_format($row['disk_free_space'] / 1073741824, 2) : '-',
            'uptime_seconds' => $row['uptime_seconds'] ? (int)$row['uptime_seconds'] : 0,
            'host' => $server['host']
        ];
        pg_close($conn);
    } catch (Exception $e) {
        $server_details[$server['name']] = [
            'disk_free_space' => '-',
            'uptime_seconds' => 0,
            'host' => $server['host']
        ];
    }
}

// Если выбран сервер, загружаем данные баз
$selected_server = $_GET['server'] ?? '';
$stats = [];
$activity = [];
if ($selected_server) {
    $server_data = null;
    foreach ($servers as $s) {
        if ($s['name'] === $selected_server) {
            $server_data = $s;
            break;
        }
    }
    if (!$server_data) {
        die("Сервер не найден.");
    }

    $period = $_GET['period'] ?? '7 days';
    $valid_periods = ['1 day', '7 days', '30 days', 'all'];
    if (!in_array($period, $valid_periods)) $period = '7 days';

    $search_db = $_GET['search_db'] ?? '';
    $sort_column = $_GET['sort'] ?? 'avg_numbackends';
    $sort_dir = $_GET['dir'] ?? 'DESC';
    $valid_columns = ['datname', 'avg_numbackends', 'total_commits', 'latest_size'];
    if (!in_array($sort_column, $valid_columns)) $sort_column = 'avg_numbackends';
    if (!in_array($sort_dir, ['ASC', 'DESC'])) $sort_dir = 'DESC';

    try {
        $conn = connect_to_db($server_data);
        $query = "
            SELECT 
                datname, 
                AVG(numbackends)::int AS avg_numbackends, 
                SUM(xact_commit) AS total_commits,
                MAX(db_size) AS latest_size,
                array_agg(numbackends ORDER BY ts) AS numbackends_history,
                array_agg(to_char(ts, 'YYYY-MM-DD HH24:MI:SS') ORDER BY ts) AS ts_history
            FROM pg_statistics
            WHERE ts > now() - interval '$period'
            " . ($search_db ? "AND datname ILIKE '%" . pg_escape_string($conn, $search_db) . "%'" : "") . "
            GROUP BY datname
            ORDER BY $sort_column $sort_dir;
        ";
        $result = pg_query($conn, $query);
        if (!$result) throw new Exception("Ошибка запроса: " . pg_last_error($conn));
        
        $server_stats = [];
        while ($row = pg_fetch_assoc($result)) {
            $numbackends_history = $row['numbackends_history'] ? array_map('intval', json_decode(str_replace(['{', '}'], ['[', ']'], $row['numbackends_history']), true)) : [];
            $ts_history = $row['ts_history'] ? json_decode(str_replace(['{', '}'], ['[', ']'], $row['ts_history']), true) : [];
            $server_stats[] = [
                "datname" => $row['datname'],
                "avg_numbackends" => $row['avg_numbackends'],
                "total_commits" => $row['total_commits'],
                "latest_size" => $row['latest_size'],
                "numbackends_history" => $numbackends_history,
                "ts_history" => $ts_history
            ];
        }
        $stats[$server_data['name']] = $server_stats;

        $activity_query = "
            SELECT state, count(*) AS count, SUM(EXTRACT(EPOCH FROM (NOW() - state_change))) AS idle_seconds
            FROM pg_stat_activity
            WHERE datname IS NOT NULL
            GROUP BY state;
        ";
        $activity_result = pg_query($conn, $activity_query);
        while ($row = pg_fetch_assoc($activity_result)) {
            $activity[$row['state']] = [
                'count' => $row['count'],
                'idle_seconds' => $row['idle_seconds'] ? (int)$row['idle_seconds'] : 0
            ];
        }
        pg_close($conn);
    } catch (Exception $e) {
        $stats[$server_data['name']] = [["error" => $e->getMessage()]];
    }
}

// Конец замера времени
$load_time = microtime(true) - $start_time;

// Форматирование времени
function format_uptime($seconds) {
    $days = floor($seconds / 86400);
    $hours = floor(($seconds % 86400) / 3600);
    $minutes = floor(($seconds % 3600) / 60);
    return "$days д. $hours ч. $minutes мин.";
}
?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <title>PostgreSQL Monitor<?php echo $selected_server ? ' - ' . htmlspecialchars($selected_server) : ''; ?></title>
    <link href="/pg-monitor/bootstrap.min.css" rel="stylesheet">
    <script src="/pg-monitor/chart.min.js"></script>
    <script src="/pg-monitor/date-fns.min.js"></script>
    <script src="/pg-monitor/chartjs-adapter-date-fns.min.js"></script>
    <style>
        .server-row { margin: 10px 0; padding: 10px; background-color: #f8f9fa; border-radius: 5px; }
        .chart-container { max-width: 1200px; margin: 20px auto; }
        table { font-size: 14px; white-space: nowrap; }
        th { cursor: pointer; }
        th.sorted-asc::after { content: ' ↑'; }
        th.sorted-desc::after { content: ' ↓'; }
        .progress { height: 20px; }
    </style>
</head>



<body class="bg-light">
    <div class="container mt-5">
        <h1 class="text-center mb-4">PostgreSQL Activity Monitor</h1>
        <div class="d-flex justify-content-between mb-4">
            <span>Последнее обновление данных: <?php echo htmlspecialchars($last_update); ?> (загрузка: <?php echo number_format($load_time, 2); ?> сек)</span>
            <a href="?logout=1" class="btn btn-secondary">Выход</a>
        </div>

        <?php if (!$selected_server): ?>
            <div class="card mb-4 shadow-sm">
                <div class="card-body">
                    <h2 class="card-title">Список серверов</h2>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Сервер</th>
                                    <th>IP</th>
                                    <th>Свободное место</th>
                                    <th>Uptime</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($servers as $server): ?>
                                    <tr>
                                        <td><a href="?server=<?php echo urlencode($server['name']); ?>"><?php echo htmlspecialchars($server['name']); ?></a></td>
                                        <td><?php echo htmlspecialchars($server_details[$server['name']]['host']); ?></td>
                                        <td><?php echo $server_details[$server['name']]['disk_free_space'] === '-' ? '-' : $server_details[$server['name']]['disk_free_space'] . ' ГБ'; ?></td>
                                        <td><?php echo format_uptime($server_details[$server['name']]['uptime_seconds']); ?></td>
                                        <td>
                                            <button class="btn btn-sm btn-warning" data-bs-toggle="modal" data-bs-target="#editModal-<?php echo htmlspecialchars($server['name']); ?>">Редактировать</button>
                                            <form method="POST" style="display:inline;" onsubmit="return confirm('Удалить сервер <?php echo htmlspecialchars($server['name']); ?>?');">
                                                <input type="hidden" name="server_name" value="<?php echo htmlspecialchars($server['name']); ?>">
                                                <button type="submit" name="delete_server" class="btn btn-sm btn-danger">Удалить</button>
                                            </form>
                                        </td>
                                    </tr>
                                    <div class="modal fade" id="editModal-<?php echo htmlspecialchars($server['name']); ?>" tabindex="-1" aria-labelledby="editModalLabel" aria-hidden="true">
                                        <div class="modal-dialog">
                                            <div class="modal-content">
                                                <div class="modal-header">
                                                    <h5 class="modal-title" id="editModalLabel">Редактировать <?php echo htmlspecialchars($server['name']); ?></h5>
                                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                                </div>
                                                <div class="modal-body">
                                                    <form method="POST">
                                                        <input type="hidden" name="old_name" value="<?php echo htmlspecialchars($server['name']); ?>">
                                                        <div class="mb-3">
                                                            <label>Название</label>
                                                            <input type="text" name="name" class="form-control" value="<?php echo htmlspecialchars($server['name']); ?>" required>
                                                        </div>
                                                        <div class="mb-3">
                                                            <label>Хост</label>
                                                            <input type="text" name="host" class="form-control" value="<?php echo htmlspecialchars($server['host']); ?>" required>
                                                        </div>
                                                        <div class="mb-3">
                                                            <label>Пользователь</label>
                                                            <input type="text" name="user" class="form-control" value="<?php echo htmlspecialchars($server['user']); ?>" required>
                                                        </div>
                                                        <div class="mb-3">
                                                            <label>Пароль</label>
                                                            <input type="password" name="password" class="form-control" value="<?php echo htmlspecialchars($server['password']); ?>">
                                                        </div>
                                                        <div class="mb-3">
                                                            <label>Порт</label>
                                                            <input type="number" name="port" class="form-control" value="<?php echo htmlspecialchars($server['port']); ?>" required>
                                                        </div>
                                                        <button type="submit" name="edit_server" class="btn btn-primary">Сохранить</button>
                                                    </form>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="card shadow-sm">
                <div class="card-body">
                    <h5 class="card-title">Добавить новый сервер</h5>
                    <form method="POST">
                        <div class="row g-2">
                            <div class="col-md-2"><input type="text" name="name" class="form-control" placeholder="Название" required></div>
                            <div class="col-md-3"><input type="text" name="host" class="form-control" placeholder="Хост" required></div>
                            <div class="col-md-2"><input type="text" name="user" class="form-control" placeholder="Пользователь" required></div>
                            <div class="col-md-2"><input type="password" name="password" class="form-control" placeholder="Пароль"></div>
                            <div class="col-md-1"><input type="number" name="port" class="form-control" value="5432" required></div>
                            <div class="col-md-2"><button type="submit" name="add_server" class="btn btn-primary w-100">Добавить</button></div>
                        </div>
                    </form>
                </div>
            </div>

        <?php else: ?>
            <h2 class="mb-4">Вы просматриваете сервер: <?php echo htmlspecialchars($selected_server); ?></h2>
            <a href="index.php" class="btn btn-secondary mb-4">Назад к серверам</a>

            <div class="card mb-4 shadow-sm">
                <div class="card-body">
                    <h3 class="card-title">Текущая активность</h3>
                    <div class="row">
                        <?php foreach ($activity as $state => $data): ?>
                            <div class="col-md-4">
                                <p><strong>Состояние: <?php echo htmlspecialchars($state ?: 'Неизвестно'); ?></strong></p>
                                <p>Сессий: <?php echo $data['count']; ?></p>
                                <p>Время простоя: <?php echo format_uptime($data['idle_seconds']); ?></p>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>

            <div class="row mb-4">
                <div class="col-md-6">
                    <label>Период:</label>
                    <select class="form-select" onchange="window.location.href='?server=<?php echo urlencode($selected_server); ?>&period='+this.value+'&sort=<?php echo urlencode($sort_column); ?>&dir=<?php echo urlencode($sort_dir); ?>&search_db=<?php echo urlencode($search_db); ?>'">
                        <option value="1 day" <?php echo $period === '1 day' ? 'selected' : ''; ?>>1 день</option>
                        <option value="7 days" <?php echo $period === '7 days' ? 'selected' : ''; ?>>7 дней</option>
                        <option value="30 days" <?php echo $period === '30 days' ? 'selected' : ''; ?>>30 дней</option>
                        <option value="all" <?php echo $period === 'all' ? 'selected' : ''; ?>>Всё время</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label>Поиск по базе:</label>
                    <form method="GET">
                        <input type="hidden" name="server" value="<?php echo htmlspecialchars($selected_server); ?>">
                        <input type="hidden" name="period" value="<?php echo htmlspecialchars($period); ?>">
                        <input type="hidden" name="sort" value="<?php echo htmlspecialchars($sort_column); ?>">
                        <input type="hidden" name="dir" value="<?php echo htmlspecialchars($sort_dir); ?>">
                        <input type="text" name="search_db" class="form-control" value="<?php echo htmlspecialchars($search_db); ?>" placeholder="Введите имя базы">
                        <button type="submit" class="btn btn-primary mt-2">Поиск</button>
                    </form>
                </div>
            </div>

            <div class="card mb-4 shadow-sm">
                <div class="card-body">
                    <h2 class="card-title">Активность баз (за <?php echo $period; ?>)</h2>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th><a href="?server=<?php echo urlencode($selected_server); ?>&period=<?php echo urlencode($period); ?>&sort=datname&dir=<?php echo $sort_column === 'datname' && $sort_dir === 'ASC' ? 'DESC' : 'ASC'; ?>&search_db=<?php echo urlencode($search_db); ?>" class="<?php echo $sort_column === 'datname' ? 'sorted-' . strtolower($sort_dir) : ''; ?>">База</a></th>
                                    <th><a href="?server=<?php echo urlencode($selected_server); ?>&period=<?php echo urlencode($period); ?>&sort=avg_numbackends&dir=<?php echo $sort_column === 'avg_numbackends' && $sort_dir === 'ASC' ? 'DESC' : 'ASC'; ?>&search_db=<?php echo urlencode($search_db); ?>" class="<?php echo $sort_column === 'avg_numbackends' ? 'sorted-' . strtolower($sort_dir) : ''; ?>">Среднее подключений</a></th>
                                    <th><a href="?server=<?php echo urlencode($selected_server); ?>&period=<?php echo urlencode($period); ?>&sort=total_commits&dir=<?php echo $sort_column === 'total_commits' && $sort_dir === 'ASC' ? 'DESC' : 'ASC'; ?>&search_db=<?php echo urlencode($search_db); ?>" class="<?php echo $sort_column === 'total_commits' ? 'sorted-' . strtolower($sort_dir) : ''; ?>">Всего коммитов</a></th>
                                    <th><a href="?server=<?php echo urlencode($selected_server); ?>&period=<?php echo urlencode($period); ?>&sort=latest_size&dir=<?php echo $sort_column === 'latest_size' && $sort_dir === 'ASC' ? 'DESC' : 'ASC'; ?>&search_db=<?php echo urlencode($search_db); ?>" class="<?php echo $sort_column === 'latest_size' ? 'sorted-' . strtolower($sort_dir) : ''; ?>">Размер (ГБ)</a></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($stats as $server => $server_stats): ?>
                                    <?php foreach ($server_stats as $row): ?>
                                        <tr <?php if (isset($row['error'])) echo 'class="text-danger"'; ?>>
                                            <td><?php echo htmlspecialchars($row['datname'] ?? $row['error']); ?></td>
                                            <td><?php echo $row['avg_numbackends'] ?? '-'; ?></td>
                                            <td><?php echo $row['total_commits'] ?? '-'; ?></td>
                                            <td><?php echo $row['latest_size'] ? number_format($row['latest_size'] / 1073741824, 2) : '-'; ?></td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="card shadow-sm">
                <div class="card-body">
                    <h2 class="card-title">История подключений</h2>
                    <?php 
                    $chart_index = 0; // Уникальный индекс для каждого графика
                    foreach ($stats as $server => $server_stats): ?>
                        <?php foreach ($server_stats as $row): if (!isset($row['error'])): ?>
                            <div class="chart-container">
                                <h3><?php echo htmlspecialchars($row['datname']); ?></h3>
                                <?php
                                $numbackends_history = $row['numbackends_history'] ?: [];
                                $ts_history = $row['ts_history'] ?: [];
                            #    echo "<pre>TS History: " . json_encode($ts_history) . "\nNumbackends History: " . json_encode($numbackends_history) . "</pre>";
                                $chart_id = 'chart_' . $chart_index++;
                                ?>
                                <canvas id="<?php echo $chart_id; ?>"></canvas>
                                <script>
                                    console.log('Создание графика для <?php echo htmlspecialchars($row['datname']); ?>');
                                    const canvas_<?php echo $chart_id; ?> = document.getElementById('<?php echo $chart_id; ?>');
                                    if (canvas_<?php echo $chart_id; ?>) {
                                        const ctx_<?php echo $chart_id; ?> = canvas_<?php echo $chart_id; ?>.getContext('2d');
                                        new Chart(ctx_<?php echo $chart_id; ?>, {
                                            type: 'line',
                                            data: {
                                                labels: <?php echo json_encode($ts_history); ?>,
                                                datasets: [{
                                                    label: '<?php echo htmlspecialchars($row['datname']); ?> - Подключения',
                                                    data: <?php echo json_encode($numbackends_history); ?>,
                                                    borderColor: '#4CAF50',
                                                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                                                    fill: true,
                                                    tension: 0.4,
                                                    pointRadius: 3,
                                                    pointHoverRadius: 5,
                                                    pointBackgroundColor: '#fff',
                                                    pointBorderColor: '#4CAF50'
                                                }]
                                            },
                                            options: {
                                                responsive: true,
                                                scales: {
                                                    x: {
                                                        type: 'time',
                                                        time: {
                                                            unit: 'hour',
                                                            displayFormats: {
                                                                hour: 'yyyy-MM-dd HH:mm'
                                                            }
                                                        },
                                                        title: { display: true, text: 'Время' }
                                                    },
                                                    y: {
                                                        beginAtZero: true,
                                                        title: { display: true, text: 'Подключения' }
                                                    }
                                                }
                                            }
                                        });
                                    } else {
                                        console.error('Элемент canvas с ID <?php echo $chart_id; ?> не найден');
                                    }
                                </script>
                            </div>
                        <?php endif; endforeach; ?>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
    <script src="/pg-monitor/bootstrap.bundle.min.js"></script>
    <script>
        // Проверка загрузки Chart.js
        if (typeof Chart === 'undefined') {
            console.error('Chart.js не загрузился. Проверьте путь к /pg-monitor/chart.min.js');
        } else {
            console.log('Chart.js загружен успешно');
        }
        // Автообновление каждые 10 секунд
        setInterval(() => {
            window.location.reload();
        }, 10000);
    </script>
</body>
</html>

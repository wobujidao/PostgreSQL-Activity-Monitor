import React from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import './MetricsOverview.css';

function MetricCard({ label, value, unit, trend }) {
  return (
    <Card className="metric-card">
      <Card.Body className="p-3">
        <div className="metric-label">{label}</div>
        <div className="metric-value">
          {value}
          {unit && <span className="metric-unit"> {unit}</span>}
        </div>
        {trend && (
          <div className={`metric-trend ${trend.direction}`}>
            {trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'} {trend.value}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function MetricsOverview({ servers = [] }) {
  // Вычисляем только статистику серверов
  const totalServers = servers.length;
  const activeServers = servers.filter(s => 
    s.status === 'ok' || 
    s.status.includes('ok') || 
    !s.status.includes('error') && 
    !s.status.includes('failed')
  ).length;

  return (
    <div className="metrics-overview mb-4">
      <Row className="justify-content-center">
        <Col md={4} sm={6}>
          <MetricCard
            label="Серверы"
            value={`${activeServers}/${totalServers}`}
            trend={activeServers === totalServers ? 
              { direction: 'up', value: 'Все онлайн' } : 
              { direction: 'down', value: `${totalServers - activeServers} недоступны` }
            }
          />
        </Col>
      </Row>
    </div>
  );
}

export default MetricsOverview;
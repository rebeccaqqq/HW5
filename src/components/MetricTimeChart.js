import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import './MetricTimeChart.css';

export default function MetricTimeChart({ data, metricLabel, title }) {
  const [open, setOpen] = useState(false);

  const safeData = Array.isArray(data) ? data : [];
  const label = metricLabel || 'Metric';

  const content = (
    <div className="metric-chart-inner">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={safeData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#020617', border: '1px solid #4b5563', fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const handleDownload = () => {
    try {
      const blob = new Blob([JSON.stringify(safeData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metric_vs_time_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="metric-chart-shell" onClick={() => setOpen(true)}>
        <div className="metric-chart-header">
          <span className="metric-chart-title">{title || `${label} vs time`}</span>
          <span className="metric-chart-hint">Click to expand</span>
        </div>
        {content}
      </div>

      {open && (
        <div className="metric-chart-modal" onClick={() => setOpen(false)}>
          <div className="metric-chart-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="metric-chart-modal-header">
              <h3>{title || `${label} vs time`}</h3>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="metric-chart-modal-chart">{content}</div>
            <div className="metric-chart-modal-footer">
              <button type="button" onClick={handleDownload}>
                Download data
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


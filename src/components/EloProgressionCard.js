import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const formatDate = (value) => {
  if (typeof value !== 'number') return 'Unknown';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatSigned = (value) => {
  if (typeof value !== 'number') return 'N/A';
  return `${value > 0 ? '+' : ''}${value}`;
};

const TooltipContent = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) return null;

  const dateText = typeof point.date === 'number' ? formatDate(point.date) : point.label || 'Season Point';

  return (
    <div
      style={{
        backgroundColor: 'rgba(5, 8, 15, 0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '10px',
        padding: '10px 12px',
      }}
    >
      <p style={{ margin: 0, color: '#d1d5db', fontSize: '12px' }}>
        {`Match #${point.matchIndex} • ${dateText}`}
      </p>
      <p style={{ margin: '4px 0 0 0', color: '#55ff55', fontSize: '13px', fontWeight: 700 }}>
        {`${point.elo} Elo`}
      </p>
      <p style={{ margin: '2px 0 0 0', color: '#fbbf24', fontSize: '12px' }}>
        {`Change: ${formatSigned(point.change)}`}
      </p>
    </div>
  );
};

const EloProgressionCard = ({ data, onPointHover, onPointSelect, selectedMatchId }) => (
  <div className="glass-panel p-6">
    <h3 className="text-xs font-bold uppercase mb-1">ELO Progression</h3>
    <p className="text-xs text-gray-400 mb-4">All-time ranked Elo by match count</p>
    {data.length === 0 ? (
      <p className="text-sm text-gray-400">No all-time Elo history available yet.</p>
    ) : (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            onMouseMove={(state) => {
              const point = state?.activePayload?.[0]?.payload || null;
              if (onPointHover) onPointHover(point);
            }}
            onMouseLeave={() => {
              if (onPointHover) onPointHover(null);
            }}
            onClick={(state) => {
              const point = state?.activePayload?.[0]?.payload || null;
              if (point && onPointSelect) onPointSelect(point);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <Line
              type="monotone"
              dataKey="elo"
              stroke="#55ff55"
              strokeWidth={3}
              dot={(props) => {
                const isSelected = props?.payload?.id === selectedMatchId;

                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={isSelected ? 3.6 : 2.4}
                    fill={isSelected ? '#ffaa00' : '#55ff55'}
                    fillOpacity={0.9}
                    stroke="#0b0f17"
                    strokeWidth={1.25}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (onPointSelect) onPointSelect(props.payload);
                    }}
                  />
                );
              }}
              activeDot={(props) => {
                const isSelected = props?.payload?.id === selectedMatchId;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={isSelected ? 6 : 4}
                    fill={isSelected ? '#ffaa00' : '#55ff55'}
                    stroke="#0b0f17"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (onPointSelect) onPointSelect(props.payload);
                    }}
                  />
                );
              }}
            />
            <XAxis
              dataKey="matchIndex"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => `#${value}`}
              minTickGap={36}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
            />
            <YAxis domain={['dataMin - 25', 'dataMax + 25']} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              content={<TooltipContent />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
);

export default EloProgressionCard;

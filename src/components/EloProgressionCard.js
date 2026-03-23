import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

const EloProgressionCard = ({ data }) => (
  <div className="glass-panel p-6">
    <h3 className="text-xs font-bold uppercase mb-4">ELO Progression</h3>
    {data.length === 0 ? (
      <p className="text-sm text-gray-400">No season progression data yet.</p>
    ) : (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line type="monotone" dataKey="elo" stroke="#55ff55" strokeWidth={3} dot={false} />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis domain={['dataMin - 25', 'dataMax + 25']} tick={{ fill: '#9ca3af', fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
);

export default EloProgressionCard;

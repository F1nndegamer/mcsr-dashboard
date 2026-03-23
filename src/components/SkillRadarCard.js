import React from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis } from 'recharts';

const SkillRadarCard = ({ skillData }) => (
  <div className="glass-panel p-6">
    <h3 className="text-xs font-bold uppercase mb-4">Skill Radar</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={skillData}>
          <PolarGrid stroke="#333" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 12 }} />
          <Radar name="F1nn" dataKey="A" stroke="#55ff55" fill="#55ff55" fillOpacity={0.5} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default SkillRadarCard;

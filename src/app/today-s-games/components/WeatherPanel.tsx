import React from 'react';
import { Wind, Droplets, Eye, Thermometer } from 'lucide-react';
import type { Weather } from '@/types';
import { getHRImpactLabel } from '@/lib/hrProjectionEngine';

interface WeatherPanelProps {
  weather: Weather;
}

const WIND_ARROW: Record<string, string> = {
  N: '↓', NE: '↙', E: '←', SE: '↖', S: '↑', SW: '↗', W: '→', NW: '↘'
};

export default function WeatherPanel({ weather }: WeatherPanelProps) {
  const impactColor =
    weather.hrImpact === 'positive' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' :
    weather.hrImpact === 'negative'? 'text-red-400 bg-red-400/10 border-red-400/20' : 'text-slate-400 bg-surface-500 border-surface-300';

  const windLabel =
    weather.windToward === 'out' ? `${weather.windDirection} out ↑` :
    weather.windToward === 'in' ? `${weather.windDirection} in ↓` :
    weather.windToward === 'crosswind' ? `${weather.windDirection} cross →` :
    `${weather.windDirection} neutral`;

  return (
    <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Thermometer size={13} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Weather</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${impactColor}`}>
          {getHRImpactLabel(weather.hrImpact)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <Thermometer size={12} className="text-slate-500 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold font-mono-stat text-slate-200">{weather.temp}°F</span>
            <span className="text-xs text-slate-500 ml-1">({weather.feelsLike}°)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Wind size={12} className="text-slate-500 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold font-mono-stat text-slate-200">{weather.windSpeed} mph</span>
            <span className="text-xs text-slate-500 ml-1">{windLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Droplets size={12} className="text-slate-500 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold font-mono-stat text-slate-200">{weather.precipitation}%</span>
            <span className="text-xs text-slate-500 ml-1">precip</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Eye size={12} className="text-slate-500 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold font-mono-stat text-slate-200">{weather.humidity}%</span>
            <span className="text-xs text-slate-500 ml-1">humidity</span>
          </div>
        </div>
      </div>

      {/* HR Impact score bar */}
      <div className="mt-2.5 pt-2.5 border-t border-surface-400">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">HR Impact Score</span>
          <span className={`text-xs font-bold font-mono-stat ${weather.hrImpact === 'positive' ? 'text-emerald-400' : weather.hrImpact === 'negative' ? 'text-red-400' : 'text-slate-400'}`}>
            {weather.hrImpactScore.toFixed(1)}/10
          </span>
        </div>
        <div className="h-1.5 w-full bg-surface-400 rounded-full">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${weather.hrImpact === 'positive' ? 'bg-emerald-400' : weather.hrImpact === 'negative' ? 'bg-red-400' : 'bg-slate-500'}`}
            style={{ width: `${(weather.hrImpactScore / 10) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
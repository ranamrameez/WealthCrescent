import type { Plugin } from 'chart.js';
import { chartThemeVisuals } from './chartThemeVisuals';
export function chartAlpha(color:string,alpha=.58):string{
 const hex=color.trim();
 if(/^#[0-9a-f]{6}$/i.test(hex)){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r}, ${g}, ${b}, ${alpha})`;}
 if(/^#[0-9a-f]{3}$/i.test(hex)){const r=parseInt(hex[1]+hex[1],16),g=parseInt(hex[2]+hex[2],16),b=parseInt(hex[3]+hex[3],16);return `rgba(${r}, ${g}, ${b}, ${alpha})`;}
 const rgb=hex.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,[^)]*)?\)$/i);
 if(rgb)return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
 return color;
}
const depthStyles = new WeakMap<object, ReturnType<typeof chartThemeVisuals>>();
export const chartDepthPlugin: Plugin = {
  id: 'finance-recorder-depth',
  beforeUpdate(chart) { depthStyles.set(chart, chartThemeVisuals()); },
  beforeDatasetDraw(chart) {
    const visuals = depthStyles.get(chart) ?? chartThemeVisuals(), ctx = chart.ctx;
    ctx.save(); ctx.shadowColor = `rgba(0,0,0,${visuals.shadowAlpha})`; ctx.shadowBlur = visuals.shadowBlur;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = visuals.shadowBlur ? 2 : 0;
  },
  afterDatasetDraw(chart) { chart.ctx.restore(); },
  afterDestroy(chart) { depthStyles.delete(chart); },
};

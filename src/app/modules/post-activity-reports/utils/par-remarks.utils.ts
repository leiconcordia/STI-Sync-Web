/**
 * Resolves the unified single Remarks description (For Future Activity Improvements)
 * from a Post-Activity Report (PAR) document.
 *
 * Uses `remarks` / `recommendations.description` first, and gracefully falls back
 * to legacy 4-area `recommendations` entries if inspecting older historical records.
 */
export function resolvePARRemarksDescription(report: any): string {
  if (!report) return '';

  const direct = String(
    report.remarks ?? report.recommendations?.description ?? ''
  ).trim();
  if (direct) return direct;

  const rec = report.recommendations;
  if (!rec || typeof rec !== 'object') return '';

  const legacyAreas: Array<{ title: string; data: any }> = [
    { title: '1. Program Flow and Content', data: rec.programFlow },
    { title: '2. Participant Engagement', data: rec.participantEngagement },
    { title: '3. Technical Setup', data: rec.technicalSetup },
    {
      title: '4. Participant Preparedness and Expectations',
      data: rec.participantPreparedness,
    },
  ];

  const extractList = (val: any): string[] => {
    if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
    if (typeof val === 'string' && val.trim()) {
      return val
        .split('\n')
        .map((s) => s.replace(/^[•\-\*]\s*/, '').trim())
        .filter(Boolean);
    }
    return [];
  };

  const blocks: string[] = [];
  for (const area of legacyAreas) {
    if (!area.data) continue;
    const obs = extractList(area.data.observationsList || area.data.observations);
    const recs = extractList(area.data.recommendationsList || area.data.recommendations);
    if (obs.length === 0 && recs.length === 0) continue;

    const lines: string[] = [area.title];
    if (obs.length > 0) {
      lines.push('Observations:');
      obs.forEach((o) => lines.push(`• ${o}`));
    }
    if (recs.length > 0) {
      lines.push('Recommendations:');
      recs.forEach((r) => lines.push(`• ${r}`));
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

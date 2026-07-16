const CATEGORY_KEYWORDS = {
  'Alarms & Diagnostics': [
    'alarm', 'error code', 'fault', 'e-stop', 'estop', 'servo error',
    'overtravel', 'axis error', 'spindle alarm', 'warning code',
    'naverr', 'servo fault', 'ethercat',
  ],
  Maintenance: [
    'maintenance', 'lubrication', 'lube', 'grease', 'pm schedule',
    'preventive maintenance', 'filter change', 'oil change', 'coolant',
    'backlash', 'calibration',
  ],
  Programming: [
    'g-code', 'gcode', 'm-code', 'macro', 'cnc program', 'conversational',
    'subroutine', 'canned cycle', 'post processor', 'threading', 'turning',
  ],
  Wiring: [
    'wiring', 'schematic', 'wire diagram', 'connector', 'pinout',
    'voltage', 'relay', 'terminal block', 'electrical diagram',
  ],
  Networking: [
    'ethernet', 'wi-fi', 'wifi', 'workgroup', 'domain', 'ftp',
    'drive mapping', 'vpn', 'ipconfig', 'network drive', 'unc path',
  ],
  'MTConnect / Options': [
    'mtconnect', 'ultimonitor', 'opticlient', 'wcfdataservice',
    'digicert', 'license code', 'vendor number',
  ],
  'Testing / Sanity Checks': [
    'sanity check', 'sanity test', 'checklist', 'tool changer',
    'rigid tapping', 'cutter comp',
  ],
  Parts: [
    'part number', 'spare part', 'replacement part', 'bill of materials',
    'bom', 'part list', 'catalog number',
  ],
};

export function suggestCategory(title, text) {
  const haystack = `${title}\n${text || ''}`.toLowerCase();
  let bestCategory = 'Uncategorized';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const matches = haystack.split(keyword).length - 1;
      score += matches;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestScore > 0 ? bestCategory : 'Uncategorized';
}

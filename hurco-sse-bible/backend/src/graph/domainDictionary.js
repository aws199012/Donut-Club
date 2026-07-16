// Hurco/CNC-specific terms that generic NLP won't recognize as meaningful entities.
// Add to these lists over time as new terms come up in your documents/tickets — no
// code changes needed elsewhere, the extractor picks up anything added here.
//
// Each category becomes its own node color in the knowledge graph. Match text is
// checked case-insensitively and word-boundary-safe (so "cam" doesn't match "camera").
export const DOMAIN_DICTIONARY = {
  technology: [
    'WinMax', 'MTConnect', 'EtherCAT', 'Ultimonitor', 'OptiClient',
    'WCFDataService', 'DigiCert', 'VMC', 'HMC', 'CNC', 'PLC', 'HMI',
    'conversational programming', 'G-code', 'M-code', 'cutter comp',
    'rigid tapping', 'canned cycle', 'post processor', 'subroutine',
    'macro', 'DXF', 'CAM', 'USB', 'VPN', 'FTP', 'UNC path',
  ],
  part: [
    'servo motor', 'spindle', 'Delta spindle', 'encoder', 'ball screw',
    'tool changer', 'ATC', 'drawbar', 'chuck', 'turret', 'tailstock',
    'way cover', 'coolant pump', 'chip auger', 'axis drive', 'VFD',
    'transformer', 'relay', 'contactor', 'limit switch', 'proximity sensor',
    'battery backup', 'UPS',
  ],
  alarm: [
    'NavErr', 'servo fault', 'servo error', 'overtravel', 'E-stop',
    'axis error', 'spindle alarm', 'following error', 'position error',
    'drive fault', 'encoder fault', 'thermal error', 'low battery alarm',
    'home error', 'reference error',
  ],
  software: [
    'WinMax Mill', 'WinMax Lathe', 'Ultimonitor', 'OptiClient',
    'MTConnect Adapter', 'Hurco Connect', 'firmware', 'license code',
    'vendor number', 'service password',
  ],
};

// Flattened for matching: [{ term, category }], longest terms first so multi-word
// matches (e.g. "Delta spindle") win over shorter substrings (e.g. "spindle").
export const FLAT_DICTIONARY = Object.entries(DOMAIN_DICTIONARY)
  .flatMap(([category, terms]) => terms.map((term) => ({ term, category })))
  .sort((a, b) => b.term.length - a.term.length);

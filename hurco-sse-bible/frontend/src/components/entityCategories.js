// Entity-category palette shared by the Knowledge Dashboard and the scoped Entity
// Explorer graph — deliberately separate from the sidebar's flat red/blue/green
// pixel-button theme (jewel/pastel tones so they read as data, not as more UI
// chrome). "query" is the central search-term node; "concept" is a RAKE keyword
// phrase rather than an extracted entity.
export const CATEGORY_COLORS = {
  query: '#f1efec',
  person: '#f6ad55',
  company: '#ecc94b',
  place: '#9f7aea',
  date: '#a0aec0',
  technology: '#4fd1c5',
  part: '#ed64a6',
  alarm: '#fc8181',
  software: '#7c86e8',
  event: '#68d391',
  concept: '#c4a86f',
};

export const CATEGORY_LABELS = {
  person: 'People',
  company: 'Companies',
  place: 'Locations',
  date: 'Dates',
  technology: 'Technologies',
  part: 'Parts',
  alarm: 'Alarms',
  software: 'Software',
  event: 'Events',
  concept: 'Concepts',
};

export const CATEGORY_SINGULAR = {
  query: 'Search term',
  person: 'Person',
  company: 'Company',
  place: 'Location',
  date: 'Date',
  technology: 'Technology',
  part: 'Machine part',
  alarm: 'Alarm / fault',
  software: 'Software',
  event: 'Event',
  concept: 'Concept',
};

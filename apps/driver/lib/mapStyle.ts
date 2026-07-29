// Clean, quiet light map style (Google Maps JSON) — hides clutter so the
// Acting UI floating on top stays the focus.
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#eaecef' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa3af' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#eaecef' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f6f8' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e3e6eb' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d9e2ec' }] },
] as const;

// Dark, quiet map — near-black canvas so the amber UI floating on top pops.
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0E1013' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5A6270' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0E1013' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#181B21' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#20242B' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2A2F38' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#141519' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#070A0E' }] },
] as const;

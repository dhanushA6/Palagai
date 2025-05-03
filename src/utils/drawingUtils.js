
export const getInterpolatedPoint = (points, t) => {
    if (points.length < 4) return { x: points[0], y: points[1] };
  
    const totalSegments = (points.length / 2) - 1;
    const segmentIndex = Math.floor(t * totalSegments);
    const segmentProgress = (t * totalSegments) - segmentIndex;
  
    const x1 = points[segmentIndex * 2];
    const y1 = points[segmentIndex * 2 + 1];
    const x2 = points[segmentIndex * 2 + 2];
    const y2 = points[segmentIndex * 2 + 3];
  

    
    return {
      x: x1 + (x2 - x1) * segmentProgress,
      y: y1 + (y2 - y1) * segmentProgress
    };
  };
  

  export const pointsToPath = (points) => {
    if (points.length < 2) return "";
    
    let path = `M ${points[0]} ${points[1]}`;
    for (let i = 2; i < points.length; i += 2) {
      path += ` L ${points[i]} ${points[i + 1]}`;
    }
    return path;
  };
  

  export const getBoundingBox = (points) => {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (let i = 0; i < points.length; i += 2) {
      minX = Math.min(minX, points[i]);
      maxX = Math.max(maxX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      maxY = Math.max(maxY, points[i + 1]);
    }
    
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  };



  

  // Add this to utils/drawingUtils.js

// Calculate distance between a point and a line segment
export const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
  const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (lineLength === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  
  // Calculate the perpendicular distance
  const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (lineLength ** 2);
  
  if (t < 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  if (t > 1) return Math.sqrt((px - x2) ** 2 + (py - y2) ** 2);
  
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
};

// Generate random particles for sprinkle effect
export const generateParticles = (x, y, count = 8) => {
  const particles = [];
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2 + 1;
    const size = Math.random() * 3 + 2;
    const lifetime = Math.random() * 500 + 500 // ms
    
    particles.push({
      id: Date.now() + i,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color: getRandomColor(),
      lifetime,
      createdAt: Date.now()
    });
  }
  
  return particles;
};

// Generate a random bright color for particles
const getRandomColor = () => {
  const colors = [
    '#FF5252', // Red
    '#FF4081', // Pink
    '#E040FB', // Purple
    '#7C4DFF', // Deep Purple
    '#536DFE', // Indigo
    '#448AFF', // Blue
    '#40C4FF', // Light Blue
    '#18FFFF', // Cyan
    '#64FFDA', // Teal
    '#69F0AE', // Green
    '#B2FF59', // Light Green
    '#EEFF41', // Lime
    '#FFFF00', // Yellow
    '#FFD740', // Amber
    '#FFAB40', // Orange
    '#FF6E40'  // Deep Orange
  ];
  
  return colors[Math.floor(Math.random() * colors.length)];
};
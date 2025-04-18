import { getBoundingBox } from './drawingUtils';

// Calculate area of overlap between two shapes
export const calculateOverlap = (templatePoints, studentPoints, gridSize = 5, threshold = 5) => {
  // Get bounding boxes
  const templateBB = getBoundingBox(templatePoints);
  const studentBB = getBoundingBox(studentPoints);
  
  // Calculate the combined area to create our grid
  const combinedBB = {
    minX: Math.min(templateBB.minX, studentBB.minX),
    minY: Math.min(templateBB.minY, studentBB.minY),
    maxX: Math.max(templateBB.maxX, studentBB.maxX),
    maxY: Math.max(templateBB.maxY, studentBB.maxY),
  };
  
  // Extend by a small margin
  const margin = 10;
  combinedBB.minX -= margin;
  combinedBB.minY -= margin;
  combinedBB.maxX += margin;
  combinedBB.maxY += margin;
  
  // Calculate grid dimensions
  const width = combinedBB.maxX - combinedBB.minX;
  const height = combinedBB.maxY - combinedBB.minY;
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  
  // Create grid masks for both shapes
  const templateMask = createShapeMask(templatePoints, combinedBB, gridSize, cols, rows, threshold);
  const studentMask = createShapeMask(studentPoints, combinedBB, gridSize, cols, rows, threshold);
  
  // Calculate overlap and total area with leniency
  let overlapCount = 0;
  let templateCount = 0;
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const index = i * cols + j;
      
      if (templateMask[index]) {
        templateCount++;
        
        // Check for nearby student points within threshold
        let hasNearbyStudentPoint = studentMask[index];
        
        if (!hasNearbyStudentPoint) {
          // Check neighboring cells within threshold distance
          const cellRadius = Math.ceil(threshold / gridSize);
          
          for (let di = -cellRadius; di <= cellRadius && !hasNearbyStudentPoint; di++) {
            for (let dj = -cellRadius; dj <= cellRadius && !hasNearbyStudentPoint; dj++) {
              const ni = i + di;
              const nj = j + dj;
              
              if (ni >= 0 && ni < rows && nj >= 0 && nj < cols) {
                const neighborIndex = ni * cols + nj;
                if (studentMask[neighborIndex]) {
                  hasNearbyStudentPoint = true;
                }
              }
            }
          }
        }
        
        if (hasNearbyStudentPoint) {
          overlapCount++;
        }
      }
    }
  }
  
  // Return overlap percentage
  return templateCount > 0 ? (overlapCount / templateCount) * 100 : 0;
};

// Updated createShapeMask function to include threshold
const createShapeMask = (points, boundingBox, gridSize, cols, rows, threshold) => {
  const mask = new Array(cols * rows).fill(false);
  
  // For each grid cell, check if it's inside or near the shape
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cellX = boundingBox.minX + j * gridSize;
      const cellY = boundingBox.minY + i * gridSize;
      
      // Check if cell center is close to any line segment
      for (let p = 0; p < points.length - 2; p += 2) {
        const x1 = points[p];
        const y1 = points[p + 1];
        const x2 = points[p + 2];
        const y2 = points[p + 3];
        
        if (isPointNearLineSegment(cellX, cellY, x1, y1, x2, y2, threshold)) {
          mask[i * cols + j] = true;
          break;
        }
      }
    }
  }
  
  return mask;
};

// Check if a point is near a line segment
const isPointNearLineSegment = (px, py, x1, y1, x2, y2, threshold) => {
  const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (lineLength === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2) <= threshold;
  
  // Calculate the perpendicular distance
  const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (lineLength ** 2);
  
  if (t < 0) {
    // Point is beyond the start of the line
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2) <= threshold;
  } else if (t > 1) {
    // Point is beyond the end of the line
    return Math.sqrt((px - x2) ** 2 + (py - y2) ** 2) <= threshold;
  } else {
    // Perpendicular distance
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2) <= threshold;
  }
};

// Calculate stroke order similarity
export const calculateStrokeOrder = (templateLines, studentLines) => {
  if (!templateLines.length || !studentLines.length) return 0;
  
  // Check if strokes were drawn in a similar order
  const templateCount = templateLines.length;
  const studentCount = studentLines.length;
  console.log(templateCount, studentCount)
  // If there's a big difference in number of strokes, penalize
  // if (Math.abs(templateCount - studentCount) > templateCount * 0.5) {
  //   return 50; // Base score if stroke count is very different
  // }
  
  // Score based on start point similarity of corresponding strokes
  let totalScore = 0;
  const minCount = Math.min(templateCount, studentCount);
  
  for (let i = 0; i < minCount; i++) {
    const templateStroke = templateLines[i];
    const studentStroke = studentLines[i];
    
    if (templateStroke && studentStroke && 
        templateStroke.points.length >= 2 && studentStroke.points.length >= 2) {
      
      // Compare start points of the strokes
      const templateStartX = templateStroke.points[0];
      const templateStartY = templateStroke.points[1];
      const studentStartX = studentStroke.points[0];
      const studentStartY = studentStroke.points[1];
      
      // Calculate distance between start points
      const distance = Math.sqrt(
        (templateStartX - studentStartX) ** 2 + 
        (templateStartY - studentStartY) ** 2
      );
      
      // Convert distance to a score (closer is better)
      const maxDistance = 100; // Maximum expected distance
      const pointScore = Math.max(0, 100 - (distance / maxDistance) * 100);
      totalScore += pointScore;
    }
  }
  
  return totalScore / minCount;
};

// Calculate proportion accuracy
export const calculateProportion = (templatePoints, studentPoints) => {
  const templateBB = getBoundingBox(templatePoints);
  const studentBB = getBoundingBox(studentPoints);
  
  // Calculate aspect ratios
  const templateRatio = templateBB.width / templateBB.height;
  const studentRatio = studentBB.width / studentBB.height;
  
  // Compare ratios (closer to 1 is better)
  const ratioDifference = Math.abs(templateRatio - studentRatio);
  
  // Convert to score (0-100)
  return Math.max(0, 100 - (ratioDifference * 100));
};

// Calculate start and end point accuracy
export const calculateEndpointAccuracy = (templateLine, studentLine) => {
  if (!templateLine || !studentLine || 
      templateLine.points.length < 2 || studentLine.points.length < 2) {
    return 0;
  }
  
  // Get start and end points
  const templateStart = { x: templateLine.points[0], y: templateLine.points[1] };
  const templateEnd = { 
    x: templateLine.points[templateLine.points.length - 2], 
    y: templateLine.points[templateLine.points.length - 1] 
  };
  
  const studentStart = { x: studentLine.points[0], y: studentLine.points[1] };
  const studentEnd = { 
    x: studentLine.points[studentLine.points.length - 2], 
    y: studentLine.points[studentLine.points.length - 1]
  };
  
  // Calculate distances
  const startDistance = Math.sqrt(
    (templateStart.x - studentStart.x) ** 2 + 
    (templateStart.y - studentStart.y) ** 2
  );
  
  const endDistance = Math.sqrt(
    (templateEnd.x - studentEnd.x) ** 2 + 
    (templateEnd.y - studentEnd.y) ** 2
  );
  
  // Convert to score (closer is better)
  const maxDistance = 100; // Maximum expected distance
  const startScore = Math.max(0, 100 - (startDistance / maxDistance) * 100);
  const endScore = Math.max(0, 100 - (endDistance / maxDistance) * 100);
  
  return (startScore + endScore) / 2;
};

// Create a heatmap showing trace quality
export const generateHeatmapData = (templateLines, studentLines, width, height) => {
  // Implementation for heatmap visualization
  // This would return data in a format that can be rendered by a heatmap component
  const heatmapData = new Array(width * height).fill(0);
  
  // For each point in the template, calculate distance to closest student line
  // and use that to generate the heatmap intensity
  
  return heatmapData;
};

// Calculate overall accuracy score
export const calculateAccuracy = (templateLines, studentLines) => {
  // Extract all points from template and student lines
  const templatePoints = templateLines.flatMap(line => line.points);
  const studentPoints = studentLines.flatMap(line => line.points);
  
  if (templatePoints.length < 2 || studentPoints.length < 2) {
    return { score: 0, overlap: 0, strokeOrder: 0, proportion: 0 };
  }
  
  // Calculate individual metrics
  const overlap = calculateOverlap(templatePoints, studentPoints);
  const strokeOrder = calculateStrokeOrder(templateLines, studentLines);
  const proportion = calculateProportion(templatePoints, studentPoints);
  
  // Calculate final score with weightings
  const finalScore = (overlap * 0.7) + (strokeOrder * 0.2) + (proportion * 0.1);
  
  return {
    score: Math.round(finalScore),
    overlap: Math.round(overlap),
    strokeOrder: Math.round(strokeOrder),
    proportion: Math.round(proportion)
  };
};
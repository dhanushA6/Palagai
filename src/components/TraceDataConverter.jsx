import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Line } from "react-konva";

const TraceDataConverter = ({ userLines, templateShapes }) => {
  const [convertedData, setConvertedData] = useState(null);
  const [visualization, setVisualization] = useState(null);
  const [imageDataURL, setImageDataURL] = useState(null);
  const stageRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 });

  // Function to normalize points to a standard range (0-1)
  const normalizePoints = (points) => {
    if (!points || points.length === 0) return [];
    
    // Find min and max for x and y
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    
    // Normalize points to 0-1 range
    const normalizedPoints = [];
    for (let i = 0; i < points.length; i += 2) {
      const normX = (points[i] - minX) / (maxX - minX || 1);
      const normY = (points[i + 1] - minY) / (maxY - minY || 1);
      normalizedPoints.push(normX, normY);
    }
    
    return normalizedPoints;
  };

  // Convert all lines to a single feature vector with centering
  const convertLinesToFeatures = () => {
    if (!userLines || userLines.length === 0) {
      alert("No drawing data available to convert!");
      return null;
    }
    
    // Combine all user lines into a single array of points
    const allPoints = [];
    userLines.forEach(line => {
      if (line.points && line.points.length > 0) {
        allPoints.push(...line.points);
      }
    });
    
    // Find global min and max for normalization
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (let i = 0; i < allPoints.length; i += 2) {
      const x = allPoints[i];
      const y = allPoints[i + 1];
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Create a 28x28 grid (common size for character recognition)
    const gridSize = 28;
    const grid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
    
    // Calculate padding to center the character
    // We'll aim to have the character occupy ~80% of the grid with equal padding
    const maxDimension = Math.max(width, height);
    const scale = (gridSize * 0.8) / maxDimension;
    
    // Calculate center offsets for centering
    const centerX = (gridSize - width * scale) / 2;
    const centerY = (gridSize - height * scale) / 2;
    
    // Fill grid based on normalized and centered points
    userLines.forEach(line => {
      if (!line.points || line.points.length < 2) return;
      
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i];
        const y = line.points[i + 1];
        
        // Normalize relative to bounding box
        const normalizedX = (x - minX) / (width || 1);
        const normalizedY = (y - minY) / (height || 1);
        
        // Scale and center in the grid
        const gridX = Math.floor(centerX + normalizedX * width * scale);
        const gridY = Math.floor(centerY + normalizedY * height * scale);
        
        // Ensure we're within bounds
        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
          grid[gridY][gridX] = 1;
          
          // Add some thickness to ensure connected lines
          // This helps prevent gaps in the drawing
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const nx = gridX + dx;
              const ny = gridY + dy;
              if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                grid[ny][nx] = 1;
              }
            }
          }
        }
      }
    });
    
    // Create a flattened feature vector from the grid
    const featureVector = grid.flat();
    
    // Calculate additional features
    const aspectRatio = width / (height || 1);
    const totalPoints = allPoints.length / 2;
    const strokeCount = userLines.length;
    
    // Create metadata object with useful information
    const metadata = {
      aspectRatio,
      totalPoints,
      strokeCount,
      boundingBox: { minX, minY, maxX, maxY },
      width,
      height,
      centerOffsets: { x: centerX, y: centerY },
      scaleFactor: scale
    };
    
    return {
      grid,
      featureVector,
      metadata,
      // Keep raw data for visualization
      rawPoints: userLines.map(line => [...line.points])
    };
  };

  // Generate visualization of the processed data
  const generateVisualization = (data) => {
    if (!data || !data.grid) return null;
    
    const { grid } = data;
    const gridSize = grid.length;
    const cellSize = Math.min(canvasSize.width, canvasSize.height) / gridSize;
    
    // Create a visualization component showing the grid
    return (
      <div className="visualization">
        <h3>Grid Representation (28x28)</h3>
        <div 
          className="grid-visualization" 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
            width: `${gridSize * cellSize}px`,
            height: `${gridSize * cellSize}px`,
            gap: '1px'
          }}
        >
          {grid.flat().map((cell, idx) => (
            <div 
              key={idx}
              style={{ 
                backgroundColor: cell > 0 ? 'black' : '#f0f0f0',
                width: `${cellSize}px`,
                height: `${cellSize}px`
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // Prepare centered drawing for the Stage component
  const prepareCenteredDrawing = () => {
    if (!userLines || userLines.length === 0) return [];
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    userLines.forEach(line => {
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i];
        const y = line.points[i + 1];
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Create centered lines for display
    const maxCanvasDim = Math.min(canvasSize.width, canvasSize.height);
    const scale = maxCanvasDim * 0.8 / Math.max(width, height);
    
    const centerX = (canvasSize.width - width * scale) / 2;
    const centerY = (canvasSize.height - height * scale) / 2;
    
    // Transform all lines
    return userLines.map(line => {
      const newPoints = [];
      
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i];
        const y = line.points[i + 1];
        
        // Center and scale
        newPoints.push(
          centerX + (x - minX) * scale,
          centerY + (y - minY) * scale
        );
      }
      
      return {
        ...line,
        points: newPoints
      };
    });
  };

  // Convert to image for alternative ML input format
  const convertToImage = () => {
    if (!stageRef.current) return;
    
    // Create white background
    const stage = stageRef.current;
    const canvas = stage.toCanvas({ pixelRatio: 2 });
    
    // Convert to dataURL (PNG format by default)
    const dataURL = canvas.toDataURL();
    setImageDataURL(dataURL);
  };

  // Handle the conversion process
  const handleConvert = () => {
    const data = convertLinesToFeatures();
    if (data) {
      setConvertedData(data);
      setVisualization(generateVisualization(data));
      setTimeout(convertToImage, 100); // Allow time for stage to render
    }
  };

  // JSON export of the data
  const exportJSON = () => {
    if (!convertedData) return;
    
    const jsonData = JSON.stringify(convertedData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tamil-letter-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle copy to clipboard
  const copyToClipboard = () => {
    if (!convertedData) return;
    
    navigator.clipboard.writeText(JSON.stringify(convertedData, null, 2))
      .then(() => alert('Data copied to clipboard!'))
      .catch(err => console.error('Failed to copy: ', err));
  };

  // Download PNG image for ML model
  const downloadPNGImage = () => {
    if (!imageDataURL) return;
    
    const a = document.createElement('a');
    a.href = imageDataURL;
    a.download = 'tamil-letter-ml-input.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Prepare centered lines for visualization
  const centeredLines = prepareCenteredDrawing();

  return (
    <div className="trace-data-converter">
      <h2>Tamil Letter Data Converter</h2>
      
      <div className="controls">
        <button 
          className="convert-btn"
          onClick={handleConvert}
          disabled={!userLines || userLines.length === 0}
        >
          Convert Drawing Data
        </button>
      </div>
      
      {convertedData && (
        <div className="results">
          <div className="result-actions">
            <button onClick={exportJSON}>Export JSON</button>
            <button onClick={copyToClipboard}>Copy to Clipboard</button>
          </div>
          
          <div className="data-overview">
            <h3>Data Summary</h3>
            <div className="metadata">
              <p><strong>Strokes:</strong> {convertedData.metadata.strokeCount}</p>
              <p><strong>Points:</strong> {convertedData.metadata.totalPoints}</p>
              <p><strong>Aspect Ratio:</strong> {convertedData.metadata.aspectRatio.toFixed(2)}</p>
              <p><strong>Size:</strong> {convertedData.metadata.width.toFixed(0)} x {convertedData.metadata.height.toFixed(0)}</p>
              <p><strong>Center Offset:</strong> X: {convertedData.metadata.centerOffsets.x.toFixed(2)}, Y: {convertedData.metadata.centerOffsets.y.toFixed(2)}</p>
              <p><strong>Scale Factor:</strong> {convertedData.metadata.scaleFactor.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="visualizations">
            <div className="original-drawing">
              <h3>Centered Drawing</h3>
              <Stage 
                width={canvasSize.width} 
                height={canvasSize.height} 
                ref={stageRef}
                style={{ border: '1px solid #ccc', background: '#fff' }}
              >
                <Layer>
                  {centeredLines.map((line, i) => (
                    <Line
                      key={i}
                      points={line.points}
                      stroke="black"
                      strokeWidth={line.strokeWidth || 3}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
            
            {visualization}
          </div>
          
          {imageDataURL && (
            <div className="image-data">
              <h3>Image Representation</h3>
              <div className="image-container">
                <img src={imageDataURL} alt="Generated drawing" style={{ maxWidth: '100%', border: '1px solid #ccc' }} />
              </div>
              <div className="image-actions">
                <button 
                  className="download-btn"
                  onClick={downloadPNGImage}
                >
                  Download PNG for ML Model
                </button>
              </div>
              <p className="help-text">This centered image can be used as input for image-based ML models.</p>
            </div>
          )}
          
          <div className="feature-data">
            <h3>Feature Vector Preview</h3>
            <div className="vector-preview">
              <pre>
                {JSON.stringify(convertedData.featureVector.slice(0, 20), null, 2)}...
                <span className="dim-text">{convertedData.featureVector.length - 20} more values</span>
              </pre>
            </div>
            <p className="help-text">Total {convertedData.featureVector.length} values (28x28 grid with centered letter)</p>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .trace-data-converter {
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
          font-family: Arial, sans-serif;
        }
        
        .controls {
          margin: 20px 0;
        }
        
        .convert-btn {
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          font-size: 16px;
        }
        
        .convert-btn:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        .results {
          margin-top: 30px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background-color: #f9f9f9;
        }
        
        .result-actions {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        
        .result-actions button {
          padding: 8px 16px;
          background-color: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .image-actions {
          margin-top: 10px;
          display: flex;
          justify-content: center;
        }
        
        .download-btn {
          padding: 8px 16px;
          background-color: #FF5722;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        }
        
        .visualizations {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          margin-top: 20px;
        }
        
        .original-drawing, .visualization {
          flex: 1;
          min-width: 300px;
        }
        
        .grid-visualization {
          margin: 10px auto;
        }
        
        .feature-data {
          margin-top: 20px;
        }
        
        .vector-preview {
          max-height: 200px;
          overflow-y: auto;
          background-color: #f0f0f0;
          padding: 10px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }
        
        .dim-text {
          color: #666;
          font-style: italic;
        }
        
        .metadata {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        
        .help-text {
          color: #666;
          font-size: 14px;
          margin-top: 5px;
        }
        
        h3 {
          margin-bottom: 10px;
          color: #333;
        }
      `}</style>
    </div>
  );
};

export default TraceDataConverter;
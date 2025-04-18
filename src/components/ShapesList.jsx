import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Circle, Rect } from "react-konva";
import { useNavigate } from "react-router-dom";
import { useShapes } from "../contexts/ShapesContext";
import { getInterpolatedPoint, pointToLineDistance } from "../utils/drawingUtils";
import { calculateAccuracy, generateHeatmapData } from "../utils/evaluationUtils";

const ShapesList = () => {
  const { savedShapes, loading } = useShapes();
  const [selectedShape, setSelectedShape] = useState(null);
  const [userLines, setUserLines] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPathIndex, setCurrentPathIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isScored, setIsScored] = useState(false);
  const [scoreData, setScoreData] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [animationSpeed, setAnimationSpeed] = useState(1); // Default speed multiplier
  const [realtimeFeedback, setRealtimeFeedback] = useState(false); // Toggle for realtime feedback
  const [cursorMode, setCursorMode] = useState("default"); // Tracks the current cursor mode
  const [showScoreOverlay, setShowScoreOverlay] = useState(false);
  // New state for line accuracy
  const [lineAccuracy, setLineAccuracy] = useState({});
  
  const stageRef = useRef(null);
  const navigate = useNavigate();

  // Reset states when selected shape changes
  useEffect(() => {
    if (selectedShape) {
      setProgress(0);
      setCurrentPathIndex(0);
      setUserLines([]);
      setIsScored(false);
      setScoreData(null);
      setShowHeatmap(false);
      setLineAccuracy({});
      setCursorMode("default");
      setShowScoreOverlay(false); // Hide score overlay when shape changes
    }
  }, [selectedShape]);

  // Animate guide dot
  const animateGuide = () => {
    if (!selectedShape) return;
    
    setIsAnimating(true);
    setCurrentPathIndex(0);
    setProgress(0);
    setCursorMode("guiding"); // Set cursor to guiding mode
    animatePath(0);
  };

  // Animate a single path
  const animatePath = (pathIndex) => {
    if (!selectedShape || pathIndex >= selectedShape.shapes.length) {
      setIsAnimating(false);
      setCursorMode("default"); // Reset cursor mode when done
      return;
    }

    setCurrentPathIndex(pathIndex);
    let startTime = performance.now();
    let duration = 5000 / animationSpeed; // Base duration adjusted by speed

    const animate = (time) => {
      if (!selectedShape) {
        cancelAnimationFrame(animate);
        setIsAnimating(false);
        setCursorMode("default");
        return;
      }

      let elapsed = (time - startTime) / duration;
      
      if (elapsed > 1) {
        setProgress(1);
        // Delay before moving to next path, also affected by speed
        setTimeout(() => {
          if (pathIndex + 1 < selectedShape.shapes.length) {
            animatePath(pathIndex + 1);
          } else {
            setIsAnimating(false);
            setCursorMode("default"); // Reset cursor mode when done
          }
        }, 500 / animationSpeed);
        return;
      }

      setProgress(elapsed);
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  // Modified checkDrawingAccuracy function to return accuracy level
  const checkDrawingAccuracy = (x, y) => {
    if (!selectedShape || !realtimeFeedback) return "neutral";
    
    let minDistance = Infinity;
    let bestAccuracy = "neutral";
    
    // Check distance to each stroke in the template
    selectedShape.shapes.forEach((templateShape) => {
      if (!templateShape || !templateShape.points) return;
      
      // Constants for accuracy thresholds
      const THRESHOLD_EXCELLENT = 5;  // Distance in pixels for "excellent" accuracy
      const THRESHOLD_GOOD = 15;      // Distance in pixels for "good" accuracy
      
      // Check distance to each segment of the template shape
      for (let i = 0; i < templateShape.points.length - 2; i += 2) {
        const x1 = templateShape.points[i];
        const y1 = templateShape.points[i + 1];
        const x2 = templateShape.points[i + 2];
        const y2 = templateShape.points[i + 3];

        const distance = pointToLineDistance(x, y, x1, y1, x2, y2);
        
        if (distance < minDistance) {
          minDistance = distance;
          
          if (distance <= THRESHOLD_EXCELLENT) {
            bestAccuracy = "excellent";
          } else if (distance <= THRESHOLD_GOOD) {
            bestAccuracy = "good";
          }
        }
      }
    });
    
    return bestAccuracy;
  }; 

  const getCurrentTemplateStrokeWidth = () => {
    if (!selectedShape || currentPathIndex >= selectedShape.shapes.length) {
      return 4; // Default width if no shape is selected
    }
    return selectedShape.shapes[currentPathIndex].strokeWidth || 4;
  };
  

  // Updated handleMouseDown with line ID and accuracy tracking
// Update handleMouseDown to include the correct stroke width
const handleMouseDown = (e) => {
  if (isAnimating) return;
  setIsDrawing(true);
  setCursorMode("drawing");
  const pos = e.target.getStage().getPointerPosition();
  
  // Get the template's stroke width
  const templateStrokeWidth = getCurrentTemplateStrokeWidth();
  
  // Create new line with unique ID and matching stroke width
  const lineId = Date.now().toString();
  setUserLines((prev) => [...prev, { 
    id: lineId, 
    points: [pos.x, pos.y],
    strokeWidth: templateStrokeWidth // Match template's stroke width
  }]);
  
  // Check accuracy on first point
  const accuracy = checkDrawingAccuracy(pos.x, pos.y);
  
  // Set accuracy for this new line
  setLineAccuracy(prev => ({
    ...prev,
    [lineId]: accuracy
  }));
};
  // Updated handleMouseMove with accuracy tracking
  const handleMouseMove = (e) => {
    if (!isDrawing || isAnimating) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    // Update the current line
    setUserLines((prev) => {
      const lastLine = prev[prev.length - 1];
      if (!lastLine) return prev;
      
      const newLastLine = {
        ...lastLine,
        points: [...lastLine.points, point.x, point.y]
      };
      
      return [...prev.slice(0, -1), newLastLine];
    });
    
    // Check accuracy and update the line's accuracy status
    if (realtimeFeedback && userLines.length > 0) {
      const accuracy = checkDrawingAccuracy(point.x, point.y);
      const currentLineId = userLines[userLines.length - 1].id;
      
      setLineAccuracy(prev => {
        // Determine new accuracy (prioritize worse accuracy)
        let newAccuracy = prev[currentLineId] || "neutral";
        
        // Only downgrade accuracy (never upgrade) - this makes the line show its worst accuracy
        if (prev[currentLineId] === "excellent" && accuracy !== "excellent") {
          newAccuracy = accuracy;
        } else if (prev[currentLineId] === "good" && accuracy === "neutral") {
          newAccuracy = accuracy;
        } else if (!prev[currentLineId]) {
          newAccuracy = accuracy;
        }
        
        return {
          ...prev,
          [currentLineId]: newAccuracy
        };
      });
    }
  };

  // Handle mouse/touch up for drawing
  const handleMouseUp = () => {
    setIsDrawing(false);
    setCursorMode(isAnimating ? "guiding" : "default"); // Reset cursor mode
  };

  // Function to get line color based on accuracy
  const getLineColorByAccuracy = (lineId) => {
    if (!realtimeFeedback) return "rgba(217, 239, 48, 0.7)"; // Default color when feedback is off
    
    const accuracy = lineAccuracy[lineId];
    
    switch (accuracy) {
      case "excellent":
        return "rgba(46, 204, 113, 0.8)"; // Green for excellent
      case "good":
        return "rgba(46, 204, 113, 0.8)"; // Yellow for good
      default:
        return "rgba(231, 76, 60, 0.8)"; // Red for neutral/poor
    }
  };

  // Function to get line width based on accuracy
  const getLineWidthByAccuracy = (lineId) => {
    if (!realtimeFeedback) return 4; // Default width when feedback is off
    
    const accuracy = lineAccuracy[lineId];
    
    switch (accuracy) {
      case "excellent":
        return 5; // Slightly thicker for excellent
      case "good":
        return 4; // Normal width for good
      default:
        return 3; // Thinner for neutral/poor
    }
  };

  // Calculate score based on template and user lines
  const calculateScore = () => {
    if (!selectedShape || userLines.length === 0) {
      alert("Please draw your shape first!");
      return;
    }

    const result = calculateAccuracy(selectedShape.shapes, userLines);
    setScoreData(result);
    setIsScored(true);
    // Show the score overlay
    setShowScoreOverlay(true);
    
    // Generate heatmap data
    if (stageRef.current) {
      const { width, height } = stageRef.current.getSize();
      const heatmap = generateHeatmapData(
        selectedShape.shapes, 
        userLines, 
        width, 
        height
      );
      setHeatmapData(heatmap);
    }
  };

  // Reset the current drawing
  const resetDrawing = () => {
    // Clear all drawings
    setUserLines([]);
    setIsScored(false);
    setScoreData(null);
    setShowHeatmap(false);
    setShowScoreOverlay(false);
    setLineAccuracy({}); // Clear line accuracy data
    setCursorMode("default"); // Reset cursor mode
  };

  // Close score overlay
  const closeScoreOverlay = () => {
    setShowScoreOverlay(false);
  };

  // Handle animation speed change
  const handleSpeedChange = (e) => {
    const newSpeed = parseFloat(e.target.value);
    setAnimationSpeed(newSpeed);
  };

  // Get speed label for display
  const getSpeedLabel = () => {
    if (animationSpeed === 0.5) return "Slow";
    if (animationSpeed === 1) return "Normal";
    if (animationSpeed === 2) return "Fast";
    if (animationSpeed === 3) return "Very Fast";
    return `${animationSpeed}x`;
  };

  // Toggle real-time feedback
  const toggleRealtimeFeedback = () => {
    setRealtimeFeedback(!realtimeFeedback);
  };

  // Render pen cursor
  const renderPenCursor = (type) => {
    const drawingPen = (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 28L4 24L18 10L22 14L8 28Z" fill="#4CAF50" stroke="#2E7D32" strokeWidth="2"/>
        <path d="M22 14L26 10C27.1046 8.89543 27.1046 7.10457 26 6L24 4C22.8954 2.89543 21.1046 2.89543 20 4L18 6L22 10L22 14Z" fill="#81C784" stroke="#2E7D32" strokeWidth="2"/>
        <circle cx="7" cy="25" r="2" fill="#E0E0E0"/>
      </svg>
    );
    
    const guidingPen = (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 28L4 24L18 10L22 14L8 28Z" fill="#FF5252" stroke="#D32F2F" strokeWidth="2"/>
        <path d="M22 14L26 10C27.1046 8.89543 27.1046 7.10457 26 6L24 4C22.8954 2.89543 21.1046 2.89543 20 4L18 6L22 10L22 14Z" fill="#FF8A80" stroke="#D32F2F" strokeWidth="2"/>
        <circle cx="7" cy="25" r="2" fill="#E0E0E0"/>
      </svg>
    );
    
    return type === "drawing" ? drawingPen : guidingPen;
  };

  // Render score overlay
  const renderScoreOverlay = () => {
    if (!showScoreOverlay || !scoreData) return null;
    
    // Get feedback message based on score
    const getFeedbackMessage = (score) => {
      if (score >= 90) return "Excellent! Your drawing is nearly perfect!";
      if (score >= 75) return "Great job! Your drawing is very good.";
      if (score >= 60) return "Good work! Keep practicing to improve.";
      if (score >= 40) return "Nice try! Practice will make it better.";
      return "Keep practicing! You'll get better with time.";
    };
    
    return (
      <div className="score-overlay">
        <div className="score-overlay-content">
          <button className="close-button" onClick={closeScoreOverlay}>×</button>
          <h2>Tracing Score</h2>
          
          <div className="score-result">
            <div className="score-circle">
              <span className="score-number">{scoreData.score}%</span>
            </div>
            <p className="score-feedback">{getFeedbackMessage(scoreData.score)}</p>
          </div>
          
          <h3>Score Details</h3>
          <div className="score-details">
            <div className="score-item">
              <span>Path Overlap:</span>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${scoreData.overlap}%` }}
                />
              </div>
              <span>{scoreData.overlap}%</span>
            </div>
            <div className="score-item">
              <span>Stroke Order:</span>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${scoreData.strokeOrder}%` }}
                />
              </div>
              <span>{scoreData.strokeOrder}%</span>
            </div>
            <div className="score-item">
              <span>Proportion:</span>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${scoreData.proportion}%` }}
                />
              </div>
              <span>{scoreData.proportion}%</span>
            </div>
          </div>
          
          <div className="score-actions">
            <button onClick={() => setShowHeatmap(!showHeatmap)}>
              {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
            </button>
            <button onClick={resetDrawing}>Try Again</button>
          </div>
        </div>
      </div>
    );
  };

  // Create a heatmap canvas image
  const createHeatmapImage = (data, width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, width, height);
    
    return canvas;
  };

  // Render heatmap overlay
  const renderHeatmap = () => {
    if (!showHeatmap || !heatmapData || !stageRef.current) return null;
    
    const { width, height } = stageRef.current.getSize();
    
    return (
      <Rect
        width={width}
        height={height}
        fillPatternImage={createHeatmapImage(heatmapData, width, height)}
        opacity={0.5}
      />
    );
  };

  // Get CSS cursor style based on mode
  const getCursorStyle = () => {
    if (cursorMode === "drawing") {
      return "url('data:image/svg+xml;utf8," + encodeURIComponent(renderPenCursor("drawing").outerHTML) + "') 2 30, auto";
    } else if (cursorMode === "guiding") {
      return "url('data:image/svg+xml;utf8," + encodeURIComponent(renderPenCursor("guiding").outerHTML) + "') 2 30, auto";
    }
    return "default";
  };

  return (
    <div className="shapes-list">
      <h1>Palagai Tool</h1>
      
      <div className="navigation">
        <button onClick={() => navigate("/")}>Back to Tracing</button>
      </div>
      
      <div className="content">
        <div className="shapes-panel">
          <h2>Your Shapes</h2>
          {loading ? (
            <p>Loading shapes...</p>
          ) : savedShapes.length === 0 ? (
            <p>No saved shapes found. Create some drawings first!</p>
          ) : (
            <ul className="shapes-menu">
              {savedShapes.map((shape, index) => (
                <li
                  key={index}
                  className={selectedShape?.id === shape.id ? "selected" : ""}
                  onClick={() => setSelectedShape(shape)}
                >
                  {shape.id}
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="practice-area">
          <div className="practice-controls">
            {selectedShape && (
              <>
                <h3>Practice: {selectedShape.id}</h3>
                <div className="button-group">
                  <button
                    className="guide-btn"
                    onClick={animateGuide}
                    disabled={isAnimating}
                  >
                    {isAnimating ? "Guiding..." : "Guide Me"}
                  </button>
                  <button 
                    className="reset-btn"
                    onClick={resetDrawing}
                    disabled={userLines.length === 0}
                  >
                    Reset
                  </button>
                  <button
                    className="score-btn"
                    onClick={calculateScore}
                    disabled={userLines.length === 0 || isScored}
                  >
                    Calculate Score
                  </button>
                </div>
                
                {/* Real-time Feedback Toggle
                <div className="feedback-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={realtimeFeedback}
                      onChange={toggleRealtimeFeedback}
                    />
                    Real-time Drawing Feedback
                  </label>
                </div> */}
                
                {/* Animation Speed Control */}
                <div className="speed-control">
                  <label htmlFor="speed-slider">Animation Speed: {getSpeedLabel()}</label>
                  <div className="speed-slider-container">
                    <span className="speed-label">Slow</span>
                    <input
                      id="speed-slider"
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.5"
                      value={animationSpeed}
                      onChange={handleSpeedChange}
                      className="speed-slider"
                      disabled={isAnimating}
                    />
                    <span className="speed-label">Fast</span>
                  </div>
                </div>
                
                {/* Feedback Color Legend */}
                
              </>
            )}
          </div>
          
          <Stage
            width={1000}
            height={500}
            ref={stageRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            className="practice-canvas"
            style={{ cursor: getCursorStyle() }}
          >
            <Layer>
              {/* Template Shape (Gray) */}
              {selectedShape &&
                selectedShape.shapes.map((shape, i) => (
                  <Line
                    key={`template-${i}`}
                    points={shape.points}
                    stroke="rgba(250, 250, 250, 0.5)"
                    strokeWidth={shape.strokeWidth || 4}
                    // lineCap="round"
                    lineJoin="round"
                    dash={[10, 10]}
                    tension={0.5}
                    bezier={true}
                  />
                ))}
         
              
              {/* User's Drawn Lines with Accuracy Colors */}
              {userLines.map((line, i) => (
                <Line
                  key={`user-${i}`}
                  points={line.points}
                  stroke={getLineColorByAccuracy(line.id)}
                  strokeWidth={line.strokeWidth || 4}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.5}
                  bezier={true}
                />
              ))}
              
              {/* Moving Dot (Progress Indicator) */}
              {selectedShape && isAnimating && selectedShape.shapes[currentPathIndex] && (
                (() => {
                  const shape = selectedShape.shapes[currentPathIndex];
                  const { x, y } = getInterpolatedPoint(shape.points, progress);
                  return (
                    <>
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={10} 
                        fill="rgba(123, 241, 59, 0.69)" 
                      />
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={5} 
                        fill="rgba(123, 241, 59, 0.69)" 
                      />
                    </>
                  );
                })()
              )}
              
              {/* Heatmap overlay when enabled */}
              {showHeatmap && renderHeatmap()}
            </Layer>
          </Stage>
        </div>
      </div>
      
      {/* Score Overlay */}
      {renderScoreOverlay()}
      
      {/* CSS for the component */}
      <style jsx>{`
        .practice-canvas {
          cursor: ${getCursorStyle()};
        }
        
        /* Score Overlay Styles */
        .score-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        .score-overlay-content {
          background-color: #ffffff;
          border-radius: 8px;
          padding: 25px;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
          position: relative;
        }
        
        .close-button {
          position: absolute;
          top: 10px;
          right: 10px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
        }
        
        .score-result {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 20px 0;
        }
        
        .score-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4CAF50, #8BC34A);
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .score-number {
          font-size: 36px;
          font-weight: bold;
          color: white;
        }
        
        .score-feedback {
          font-size: 18px;
          text-align: center;
          color: #333;
          margin: 0;
        }
        
        .score-details {
          background-color: #f5f5f5;
          border-radius: 6px;
          padding: 15px;
          margin-top: 15px;
        }
        
        .score-item {
          display: flex;
          align-items: center;
          margin: 10px 0;
        }
        
        .score-item span {
          flex: 1;
          font-size: 14px;
        }
        
        .progress-bar {
          flex: 2;
          height: 12px;
          background-color: #e0e0e0;
          border-radius: 6px;
          margin: 0 10px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #8BC34A);
          border-radius: 6px;
        }
        
        .score-actions {
          display: flex;
          justify-content: space-around;
          margin-top: 20px;
        }
        
        .score-actions button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          background-color: #4CAF50;
          color: white;
          font-weight: bold;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        
        .score-actions button:hover {
          background-color: #3e8e41;
        }
        
        /* Feedback legend styles */
        .feedback-legend {
          margin-top: 15px;
          padding: 10px;
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
        }
        
        .feedback-legend h4 {
          margin-top: 0;
          margin-bottom: 8px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          margin: 5px 0;
        }
        
        .color-sample {
          width: 20px;
          height: 10px;
          border-radius: 3px;
          margin-right: 8px;
        }
      `}</style>
    </div>
  );
};

export default ShapesList;
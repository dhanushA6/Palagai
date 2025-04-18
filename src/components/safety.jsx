import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Circle, Rect } from "react-konva";
import { useNavigate } from "react-router-dom";
import { useShapes } from "../contexts/ShapesContext";
import { getInterpolatedPoint } from "../utils/drawingUtils";
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
    }
  }, [selectedShape]);

  // Animate guide dot
  const animateGuide = () => {
    if (!selectedShape) return;
    
    setIsAnimating(true);
    setCurrentPathIndex(0);
    setProgress(0);
    animatePath(0);
  };

  // Animate a single path
  const animatePath = (pathIndex) => {
    if (!selectedShape || pathIndex >= selectedShape.shapes.length) {
      setIsAnimating(false);
      return;
    }

    setCurrentPathIndex(pathIndex);
    let startTime = performance.now();
    let duration = 5000 / animationSpeed; // Base duration adjusted by speed

    const animate = (time) => {
      if (!selectedShape) {
        cancelAnimationFrame(animate);
        setIsAnimating(false);
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
          }
        }, 500 / animationSpeed);
        return;
      }

      setProgress(elapsed);
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  // Handle mouse/touch down for drawing
  const handleMouseDown = (e) => {
    if (isAnimating) return;
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    setUserLines((prev) => [...prev, { points: [pos.x, pos.y] }]);
  };

  // Handle mouse/touch move for drawing
  const handleMouseMove = (e) => {
    if (!isDrawing || isAnimating) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    setUserLines((prev) => {
      const lastLine = prev[prev.length - 1];
      if (!lastLine) return prev;
      
      const newLastLine = {
        ...lastLine,
        points: [...lastLine.points, point.x, point.y]
      };
      
      return [...prev.slice(0, -1), newLastLine];
    });
  };

  // Handle mouse/touch up for drawing
  const handleMouseUp = () => {
    setIsDrawing(false);
    // Clear scores when new lines are drawn
    // if (isScored) {
    //   setIsScored(false);
    //   setScoreData(null);
    // }
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
    setUserLines([]);
    setIsScored(false);
    setScoreData(null);
    setShowHeatmap(false);
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

  // Render score card
  const renderScoreCard = () => {
    if (!isScored || !scoreData) return null;
    
    return (
      <div className="score-card">
        <h3>Score: {scoreData.score}%</h3>
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
        </div>
      </div>
    );
  };

  // Render heatmap overlay
  const renderHeatmap = () => {
    if (!showHeatmap || !heatmapData || !stageRef.current) return null;
    
    const { width, height } = stageRef.current.getSize();
    
    // For simplicity, let's create a color-coded overlay that shows
    // how close the user's drawing matches the template
    return (
      <Rect
        width={width}
        height={height}
        fillPatternImage={createHeatmapImage(heatmapData, width, height)}
        opacity={0.5}
      />
    );
  };
  
  // Create a heatmap canvas image
  const createHeatmapImage = (data, width, height) => {
    // This function would create an image from the heatmap data
    // For this example, we'll skip the actual implementation
    // In a real implementation, you'd create a canvas and color
    // it based on the proximity/accuracy data
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Simplistic implementation - in a real app, use the data to create a proper heatmap
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, width, height);
    
    return canvas;
  };

  return (
    <div className="shapes-list">
      <h1>Saved Shapes</h1>
      
      <div className="navigation">
        <button onClick={() => navigate("/")}>Back to Drawing</button>
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
                    lineCap="round"
                    lineJoin="round"
                    dash={[10, 5]}
                    tension={0.5}
                    bezier={true}
                  />
                ))}
              
              {/* User's Drawn Lines (Black) */}
              {userLines.map((line, i) => (
                <Line
                  key={`user-${i}`}
                  points={line.points}
                  stroke="rgba(72, 230, 15, 0.5)"
                  strokeWidth={4}
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
                        fill="rgba(255, 0, 0, 0.5)" 
                      />
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={5} 
                        fill="#ff0000" 
                      />
                    </>
                  );
                })()
              )}
              
              {/* Heatmap overlay when enabled */}
              {showHeatmap && renderHeatmap()}
            </Layer>
          </Stage>
          
          {/* Score information */}
          {renderScoreCard()}
        </div>
      </div>
    </div>
  );
};

export default ShapesList;
import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Circle, Rect } from "react-konva";
import { useNavigate } from "react-router-dom";
import { useShapes } from "../contexts/ShapesContext";
import { getInterpolatedPoint, pointToLineDistance } from "../utils/drawingUtils";
import { calculateAccuracy, generateHeatmapData } from "../utils/evaluationUtils"; 
import { saveShapes } from "../utils/database";
import TamilAudioPlayer from "./TamilAudioPlayer";


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
  const [lineAccuracy, setLineAccuracy] = useState({});
   
  const [showDataConverter, setShowDataConverter] = useState(false);
  // New state for canvas dimensions
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 1000, height: 500 });
  // Scale factor for template points
  const [scaleFactor, setScaleFactor] = useState(1);
  // Original bounds of the template
  const [templateBounds, setTemplateBounds] = useState({ minX: 0, minY: 0, maxX: 1000, maxY: 500 });
  
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  // Calculate template bounds when a shape is selected
  useEffect(() => {
    if (selectedShape && selectedShape.shapes && selectedShape.shapes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Find the bounding box of the template points
      selectedShape.shapes.forEach(shape => {
        for (let i = 0; i < shape.points.length; i += 2) {
          const x = shape.points[i];
          const y = shape.points[i + 1];
          
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      });
      
      // Add padding
      const padding = 20;
      setTemplateBounds({
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
      });
    }
  }, [selectedShape]);

  // Function to calculate scale factor based on canvas size and template bounds
  const calculateScaleFactor = (width, height) => {
    if (!selectedShape) return 1;
    
    const bounds = templateBounds;
    const templateWidth = bounds.maxX - bounds.minX;
    const templateHeight = bounds.maxY - bounds.minY;
    
    // Calculate how much we need to scale to fit the template in the canvas
    const widthScale = width / templateWidth;
    const heightScale = height / templateHeight;
    
    // Use the smaller scale to ensure the entire template fits
    return Math.min(widthScale, heightScale, 2); // Cap at 2x to prevent excessive scaling
  };

  // Scale template points to fit current canvas
  const scalePoint = (point) => {
    if (!selectedShape) return point;
    
    const bounds = templateBounds;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Center point relative to template center
    const centeredX = point.x - centerX;
    const centeredY = point.y - centerY;
    
    // Scale and translate to canvas center
    const canvasCenterX = canvasDimensions.width / 2;
    const canvasCenterY = canvasDimensions.height / 2;
    
    return {
      x: canvasCenterX + centeredX * scaleFactor,
      y: canvasCenterY + centeredY * scaleFactor
    };
  };

  // Scale a single coordinate
  const scaleCoordinate = (coord, isX) => {
    if (!selectedShape) return coord;
    
    const bounds = templateBounds;
    const center = isX 
      ? (bounds.minX + bounds.maxX) / 2
      : (bounds.minY + bounds.maxY) / 2;
    const canvasCenter = isX
      ? canvasDimensions.width / 2
      : canvasDimensions.height / 2;
    
    // Center, scale, and translate to canvas center
    return canvasCenter + (coord - center) * scaleFactor;
  };

  // Scale an array of points
  const scalePoints = (points) => {
    if (!points) return [];
    
    const scaledPoints = [];
    for (let i = 0; i < points.length; i += 2) {
      scaledPoints.push(scaleCoordinate(points[i], true));
      scaledPoints.push(scaleCoordinate(points[i + 1], false));
    }
    return scaledPoints;
  };

  // Update canvas dimensions on window resize
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        // Get the container width
        const containerWidth = containerRef.current.offsetWidth;
        
        // Set canvas width to container width and keep aspect ratio for height
        const newWidth = Math.min(containerWidth, 1200); // Cap at 1200px
        const newHeight = newWidth * 0.5; // Maintain 2:1 aspect ratio
        
        setCanvasDimensions({ width: newWidth, height: newHeight });
        
        // Calculate new scale factor
        if (selectedShape) {
          const newScaleFactor = calculateScaleFactor(newWidth, newHeight);
          setScaleFactor(newScaleFactor);
        }
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [selectedShape, templateBounds]);

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
      setShowScoreOverlay(false);
      
      // Update scale factor for the new shape
      if (containerRef.current) {
        const newScaleFactor = calculateScaleFactor(
          canvasDimensions.width,
          canvasDimensions.height
        );
        setScaleFactor(newScaleFactor);
      }
    }
  }, [selectedShape]);

  // Animate guide dot
  const animateGuide = () => {
    if (!selectedShape) return;
    
    setIsAnimating(true);
    setCurrentPathIndex(0);
    setProgress(0);
    setCursorMode("guiding");
    animatePath(0);
  };

  // Animate a single path
  const animatePath = (pathIndex) => {
    if (!selectedShape || pathIndex >= selectedShape.shapes.length) {
      setIsAnimating(false);
      setCursorMode("default");
      return;
    }

    setCurrentPathIndex(pathIndex);
    let startTime = performance.now();
    let duration = 5000 / animationSpeed;

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
        setTimeout(() => {
          if (pathIndex + 1 < selectedShape.shapes.length) {
            animatePath(pathIndex + 1);
          } else {
            setIsAnimating(false);
            setCursorMode("default");
          }
        }, 500 / animationSpeed);
        return;
      }

      setProgress(elapsed);
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  // Modified check drawing accuracy to work with scaled points
  const checkDrawingAccuracy = (x, y) => {
    if (!selectedShape || !realtimeFeedback) return "neutral";
    
    let minDistance = Infinity;
    let bestAccuracy = "neutral";
    
    // Check distance to each stroke in the template
    selectedShape.shapes.forEach((templateShape) => {
      if (!templateShape || !templateShape.points) return;
      
      // Scale the thresholds based on the scale factor
      const THRESHOLD_EXCELLENT = 5 * scaleFactor;
      const THRESHOLD_GOOD = 15 * scaleFactor;
      
      // Get scaled template points
      const scaledPoints = scalePoints(templateShape.points);
      
      // Check distance to each segment of the template shape
      for (let i = 0; i < scaledPoints.length - 2; i += 2) {
        const x1 = scaledPoints[i];
        const y1 = scaledPoints[i + 1];
        const x2 = scaledPoints[i + 2];
        const y2 = scaledPoints[i + 3];

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
      return 4 * scaleFactor; // Scale the stroke width
    }
    return (selectedShape.shapes[currentPathIndex].strokeWidth || 4) * scaleFactor;
  };

  // Updated handlers to work with scaled points
  const handleMouseDown = (e) => {
    if (isAnimating) return;
    setIsDrawing(true);
    setCursorMode("drawing");
    const pos = e.target.getStage().getPointerPosition();
    
    // Get and scale the template's stroke width
    const templateStrokeWidth = getCurrentTemplateStrokeWidth();
    
    // Create new line with unique ID and matching stroke width
    const lineId = Date.now().toString();
    setUserLines((prev) => [...prev, { 
      id: lineId, 
      points: [pos.x, pos.y],
      strokeWidth: templateStrokeWidth
    }]);
    
    // Check accuracy on first point
    const accuracy = checkDrawingAccuracy(pos.x, pos.y);
    
    // Set accuracy for this new line
    setLineAccuracy(prev => ({
      ...prev,
      [lineId]: accuracy
    }));
  };

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
        
        // Only downgrade accuracy (never upgrade)
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

  const handleMouseUp = () => {
    setIsDrawing(false);
    setCursorMode(isAnimating ? "guiding" : "default");
  };

  // Function to get line color based on accuracy
  const getLineColorByAccuracy = (lineId) => {
    if (!realtimeFeedback) return "rgba(217, 239, 48, 0.7)";
    
    const accuracy = lineAccuracy[lineId];
    
    switch (accuracy) {
      case "excellent":
        return "rgba(46, 204, 113, 0.8)";
      case "good":
        return "rgba(46, 204, 113, 0.8)";
      default:
        return "rgba(231, 76, 60, 0.8)";
    }
  };

  // Function to get line width based on accuracy
  const getLineWidthByAccuracy = (lineId) => {
    if (!realtimeFeedback) return 4 * scaleFactor;
    
    const accuracy = lineAccuracy[lineId];
    const baseWidth = 4 * scaleFactor;
    
    switch (accuracy) {
      case "excellent":
        return baseWidth * 1.25;
      case "good":
        return baseWidth;
      default:
        return baseWidth * 0.75;
    }
  };

  // Modified to work with scaled points
  const calculateScore = () => {
    if (!selectedShape || userLines.length === 0) {
      alert("Please draw your shape first!");
      return;
    }

    // Scale template points for scoring
    const scaledTemplateShapes = selectedShape.shapes.map(shape => ({
      ...shape,
      points: scalePoints(shape.points)
    }));

    const result = calculateAccuracy(scaledTemplateShapes, userLines);
    setScoreData(result);
    setIsScored(true);
    setShowScoreOverlay(true);
    
    // Generate heatmap data with scaled points
    if (stageRef.current) {
      const { width, height } = stageRef.current.getSize();
      const heatmap = generateHeatmapData(
        scaledTemplateShapes, 
        userLines, 
        width, 
        height
      );
      setHeatmapData(heatmap);
    }
  };

  const resetDrawing = () => {
    setUserLines([]);
    setIsScored(false);
    setScoreData(null);
    setShowHeatmap(false);
    setShowScoreOverlay(false);
    setLineAccuracy({});
    setCursorMode("default");
  };

  const closeScoreOverlay = () => {
    setShowScoreOverlay(false);
  };

  const handleSpeedChange = (e) => {
    const newSpeed = parseFloat(e.target.value);
    setAnimationSpeed(newSpeed);
  };

  const getSpeedLabel = () => {
    if (animationSpeed === 0.5) return "Slow";
    if (animationSpeed === 1) return "Normal";
    if (animationSpeed === 2) return "Fast";
    if (animationSpeed === 3) return "Very Fast";
    return `${animationSpeed}x`;
  };

  const toggleRealtimeFeedback = () => {
    setRealtimeFeedback(!realtimeFeedback);
  };

  // Render functions for UI elements
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
        
        <div className="practice-area" ref={containerRef}>
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
                <TamilAudioPlayer selectedShapeId={selectedShape?.id} />
              
              </>
            )}   

      
        
          </div>
   
          <Stage
            width={canvasDimensions.width}
            height={canvasDimensions.height}
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
                    points={scalePoints(shape.points)}
                    stroke="rgba(250, 250, 250, 0.5)"
                    strokeWidth={(shape.strokeWidth || 4) * scaleFactor}
                    lineJoin="round"
                    dash={[10 * scaleFactor, 10 * scaleFactor]}
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
                  strokeWidth={line.strokeWidth || (4 * scaleFactor)}
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
                  const scaledPoints = scalePoints(shape.points);
                  const { x, y } = getInterpolatedPoint(scaledPoints, progress);
                  return (
                    <>
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={10 * Math.sqrt(scaleFactor)} // Scale radius using square root for better proportions
                        fill="rgba(123, 241, 59, 0.69)" 
                      />
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={5 * Math.sqrt(scaleFactor)}
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
        .shapes-list {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
        }
        
        .content {
          display: flex;
          flex-direction: column;
        }
        
        @media (min-width: 768px) {
          .content {
            flex-direction: row;
          }
        }
        
        .shapes-panel {
          width: 100%;
          max-width: 100%;
          margin-bottom: 1rem;
        }
        
        @media (min-width: 768px) {
          .shapes-panel {
            width: 250px;
            min-width: 250px;
            margin-right: 1rem;
            margin-bottom: 0;
          }
        }
        
        .practice-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        
        .practice-canvas {
          cursor: ${getCursorStyle()};
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-top: 1rem;
          width: 100%;
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







  .data-converter-container {
  margin-top: 20px;
  border-top: 1px solid #ddd;
  padding-top: 20px;
  }

  .analyze-btn {
  padding: 8px 16px;
  background-color: #9C27B0;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 10px;
  }

  .analyze-btn:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
  }
      `}</style>
    </div>
  );
};

export default ShapesList;
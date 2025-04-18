import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Circle, Rect } from "react-konva";
import { useNavigate } from "react-router-dom";
import { useShapes } from "../contexts/ShapesContext";
import { getInterpolatedPoint, pointToLineDistance, generateParticles } from "../utils/drawingUtils";
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
  const [particles, setParticles] = useState([]);
  const [lastPoint, setLastPoint] = useState(null);
  const [realtimeFeedback, setRealtimeFeedback] = useState(false); // Toggle for realtime feedback
  const [cursorMode, setCursorMode] = useState("default"); // Tracks the current cursor mode
  // Add new state for overlay
  const [showScoreOverlay, setShowScoreOverlay] = useState(false);
  
  const stageRef = useRef(null);
  const particleAnimationRef = useRef(null);
  const particleTimeoutRef = useRef(null);
  const navigate = useNavigate();

  // Clear all particles with a dedicated function
  const clearAllParticles = () => {
    // Cancel any pending timeouts
    if (particleTimeoutRef.current) {
      clearTimeout(particleTimeoutRef.current);
    }
    // Clear all particles immediately
    setParticles([]);
  };

  // Reset states when selected shape changes
  useEffect(() => {
    if (selectedShape) {
      setProgress(0);
      setCurrentPathIndex(0);
      setUserLines([]);
      setIsScored(false);
      setScoreData(null);
      setShowHeatmap(false);
      clearAllParticles(); // Use the dedicated function
      setCursorMode("default");
      setShowScoreOverlay(false); // Hide score overlay when shape changes
    }
  }, [selectedShape]);

  // Clear particles after delay - updated with shorter delay
  const clearParticlesAfterDelay = (delay = 10) => { // Reduced to 1 second
    // Clear any existing timeout to prevent multiple timeouts
    if (particleTimeoutRef.current) {
      clearTimeout(particleTimeoutRef.current);
    }
    
    // Set new timeout to clear particles
    particleTimeoutRef.current = setTimeout(() => {
      setParticles([]); // Clear all particles
    }, delay);
  };

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

  // Animate particles - Updated to make particles fade out more quickly
  useEffect(() => {
    // Update particles animation
    const animateParticles = () => {
      setParticles(prevParticles => {
        const now = Date.now();
        // Update positions and filter out expired particles
        return prevParticles
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.05, // Add gravity
            size: p.size * 0.92 // Shrink much more quickly (changed from 0.96)
          }))
          .filter(p => {
            // Filter out particles that are too small or have exceeded their lifetime
            return now - p.createdAt < p.lifetime;
          });
      });

      particleAnimationRef.current = requestAnimationFrame(animateParticles);
    };

    // Start animation
    particleAnimationRef.current = requestAnimationFrame(animateParticles);

    // Cleanup
    return () => {
      if (particleAnimationRef.current) {
        cancelAnimationFrame(particleAnimationRef.current);
      }
      if (particleTimeoutRef.current) {
        clearTimeout(particleTimeoutRef.current);
      }
    };
  }, []);

  // Modified checkDrawingAccuracy function
  const checkDrawingAccuracy = (x, y) => {
    if (!selectedShape || !realtimeFeedback) return false;
    
    // Find the current template shape that the user should be drawing
    // We need to check against all strokes to properly handle multiple-stroke templates
    let bestAccuracy = false;
    let minDistance = Infinity;
    
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
            bestAccuracy = 'excellent';
          } else if (distance <= THRESHOLD_GOOD) {
            bestAccuracy = 'good';
          }
        }
      }
    });
    
    return bestAccuracy;
  };

  // Create particles at point if drawing accurately - Modified with shorter lifetimes
  const createFeedbackParticles = (x, y, accuracy) => {
    // Don't create particles too frequently - increased minimum distance to reduce particles
    if (lastPoint && 
        Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2) < 15) {
      return;
    }
    
    setLastPoint({ x, y });
    
    if (accuracy === 'excellent') {
      // Create particles for excellent accuracy with much shorter lifetime
      const newParticles = generateParticles(x, y, 8).map(p => ({
        ...p,
        lifetime: 200 // Even shorter lifetime in milliseconds
      }));
      setParticles(prev => [...prev, ...newParticles]);
    } else if (accuracy === 'good') {
      // Fewer particles for good accuracy with shorter lifetime
      const newParticles = generateParticles(x, y, 4).map(p => ({
        ...p,
        lifetime: 150 // Even shorter lifetime for "good" accuracy
      }));
      setParticles(prev => [...prev, ...newParticles]);
    }

    // Force clear particles after a short delay
    clearParticlesAfterDelay(800); // Force clear after 800ms
  };

  // Handle mouse/touch down for drawing
  const handleMouseDown = (e) => {
    if (isAnimating) return;
    setIsDrawing(true);
    setCursorMode("drawing"); // Set cursor to drawing mode
    const pos = e.target.getStage().getPointerPosition();
    setUserLines((prev) => [...prev, { points: [pos.x, pos.y] }]);
    
    // Check accuracy on first point
    const accuracy = checkDrawingAccuracy(pos.x, pos.y);
    if (accuracy) {
      createFeedbackParticles(pos.x, pos.y, accuracy);
    }
  };

  // Handle mouse/touch move for drawing
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
    
    // Check accuracy and create particles if drawing is accurate
    const accuracy = checkDrawingAccuracy(point.x, point.y);
    if (accuracy) {
      createFeedbackParticles(point.x, point.y, accuracy);
    }
  };

  // Handle mouse/touch up for drawing - Updated to clear particles quickly
  const handleMouseUp = () => {
    setIsDrawing(false);
    setLastPoint(null);
    setCursorMode(isAnimating ? "guiding" : "default"); // Reset to guiding if that's active, otherwise default
    
    // Clear particles after a short delay
    setTimeout(() => {
      setParticles([]);
    }, 300); // Short delay (300ms) to clear particles after lifting the pen
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
    
    // Clear any particles that might be left
    clearAllParticles();
  };

  // Reset the current drawing
  const resetDrawing = () => {
    // Clear all drawings and particles
    setUserLines([]);
    setIsScored(false);
    setScoreData(null);
    setShowHeatmap(false);
    setShowScoreOverlay(false); // Hide score overlay when resetting
    clearAllParticles(); // Use the dedicated function to ensure all particles are gone 
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
          <h2>Drawing Score</h2>
          
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
                
                {/* Real-time Feedback Toggle */}
                <div className="feedback-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={realtimeFeedback}
                      onChange={toggleRealtimeFeedback}
                    />
                    Real-time Drawing Feedback
                  </label>
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
                    lineCap="round"
                    lineJoin="round"
                    dash={[10, 5]}
                    tension={0.5}
                    bezier={true}
                  />
                ))}
              
              {/* User's Drawn Lines (Green) */}
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
                        fill="rgba(123, 241, 59, 0.69) " 
                      />
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={5} 
                        fill="rgba(123, 241, 59, 0.69) " 
                      />
                    </>
                  );
                })()
              )}
              
              {/* Feedback Particles */}
              {particles.map(particle => (
                <Circle
                  key={`particle-${particle.id}`}
                  x={particle.x}
                  y={particle.y}
                  radius={particle.size}
                  fill={particle.color}
                  opacity={(particle.lifetime - (Date.now() - particle.createdAt)) / particle.lifetime}
                />
              ))}
              
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
      `}</style>
    </div>
  );
};

export default ShapesList;
import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Circle, Rect } from "react-konva";
import { useNavigate } from "react-router-dom";
import { getInterpolatedPoint, pointToLineDistance } from "../utils/drawingUtils";
import { calculateAccuracy, generateHeatmapData } from "../utils/evaluationUtils"; 
import TamilAudioPlayer from "./TamilAudioPlayer";
import '../styles/ShapeList.css';
// Define the shapes list
// const SHAPES = ['a', 'aa', 'e', 'ee',  'ka', 'ra', 'pa', 'maa', 'ow', 'oa', 'ba', 'da', 'la', 'kaa', 'may', 'ke', 'so'];
const SHAPES = ['aa', 'a', 'e', 'ee',  'ka', 'ra', 'pa', 'maa', 'ow', 'oa'];
const BOX_TYPES = {
  CARBON: 'carbon',
  CRYSTAL: 'crystal',
  DIAMOND: 'diamond'
};

const ShapesList = () => {
  const [savedShapes, setSavedShapes] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [userLines, setUserLines] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPathIndex, setCurrentPathIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isScored, setIsScored] = useState(false);
  const [scoreData, setScoreData] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [realtimeFeedback, setRealtimeFeedback] = useState(false);
  const [cursorMode, setCursorMode] = useState("default");
  const [showScoreOverlay, setShowScoreOverlay] = useState(false);
  const [lineAccuracy, setLineAccuracy] = useState({});
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 1000, height: 500 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [templateBounds, setTemplateBounds] = useState({ minX: 0, minY: 0, maxX: 1000, maxY: 500 });
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [showGameComplete, setShowGameComplete] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const audioPlayerRef = useRef(null);
  
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const [boxes, setBoxes] = useState({
    [BOX_TYPES.CARBON]: [],
    [BOX_TYPES.CRYSTAL]: [],
    [BOX_TYPES.DIAMOND]: []
  });
  const [movingShape, setMovingShape] = useState(null);
  const [levelProgress, setLevelProgress] = useState({});

  // Load all shapes on component mount
  useEffect(() => {
    const loadAllShapes = async () => {
      setLoading(true);
      try {
        const loadedShapes = await Promise.all(
          SHAPES.map(async (shapeId) => {
            const data = await loadShapeData(shapeId);
            return data;
          })
        );
        
        const flattenedShapes = loadedShapes
          .filter(shape => shape !== null)
          .flatMap(shape => Array.isArray(shape) ? shape : [shape]);
          
        setSavedShapes(flattenedShapes);
      } catch (error) {
        console.error("Error loading shapes:", error);
        setSavedShapes([]);
      } finally {
        setLoading(false);
      }
    };
  
    loadAllShapes();
  }, []);

  // Update current shape data when shape index changes
  useEffect(() => {
    if (currentShapeIndex < SHAPES.length) { 
      const current_shape = getCurrentShape(currentShapeIndex); 
      console.log(current_shape);
      const shapeData = savedShapes.find(shape => shape.id === current_shape.id);
      if (shapeData) {
        updateTemplateBounds(shapeData);
      }
    }
  }, [currentShapeIndex, savedShapes, isGameStarted]);

  // Reset states when shape changes
  useEffect(() => {
    resetStates();
  }, [currentShapeIndex]);

  // Update canvas dimensions on window resize
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const newWidth = Math.min(containerWidth, 1200);
        const newHeight = newWidth * 0.5;
        
        setCanvasDimensions({ width: newWidth, height: newHeight });
        
        const newScaleFactor = calculateScaleFactor(newWidth, newHeight);
        setScaleFactor(newScaleFactor);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [templateBounds]);

  // Play audio when shape changes
  useEffect(() => {
    if (audioPlayerRef.current && getCurrentShape()) {
      audioPlayerRef.current.playAudio();
    }
  }, [currentShapeIndex, isGameStarted]);

  // Load level progress from localStorage on mount
  useEffect(() => {
    const savedProgress = localStorage.getItem('levelProgress');
    if (savedProgress) {
      setLevelProgress(JSON.parse(savedProgress));
    }
  }, []);

  // Save level progress to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('levelProgress', JSON.stringify(levelProgress));
  }, [levelProgress]);

  // Initialize boxes when shapes are loaded
  useEffect(() => {
    if (savedShapes.length > 0) {
      const initialBoxes = {
        [BOX_TYPES.CARBON]: SHAPES.map(shapeId => ({
          id: shapeId,
          box: BOX_TYPES.CARBON
        })),
        [BOX_TYPES.CRYSTAL]: [],
        [BOX_TYPES.DIAMOND]: []
      };
      setBoxes(initialBoxes);
    }
  }, [savedShapes]);

  const loadShapeData = async (shapeId) => {


    try {
      const shapeData = await import(`../assets/data/${shapeId}.json`);
      return shapeData.default || shapeData;
    } catch (error) {
      console.error(`Error loading shape data for ${shapeId}:`, error);
      return null;
    }
  };

  // Calculate template bounds when a shape is selected
  const updateTemplateBounds = (shape) => {
    if (shape && shape.shapes && shape.shapes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      shape.shapes.forEach(shape => {
        for (let i = 0; i < shape.points.length; i += 2) {
          const x = shape.points[i];
          const y = shape.points[i + 1];
          
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      });
      
      const padding = 20;
      setTemplateBounds({
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
      });
    }
  };

  // Function to calculate scale factor based on canvas size and template bounds
  const calculateScaleFactor = (width, height) => {
    const bounds = templateBounds;
    const templateWidth = bounds.maxX - bounds.minX;
    const templateHeight = bounds.maxY - bounds.minY;
    
    const widthScale = width / templateWidth;
    const heightScale = height / templateHeight;
    
    return Math.min(widthScale, heightScale, 2);
  };

  // Scale template points to fit current canvas
  const scalePoint = (point) => {
    const bounds = templateBounds;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    const centeredX = point.x - centerX;
    const centeredY = point.y - centerY;
    
    const canvasCenterX = canvasDimensions.width / 2;
    const canvasCenterY = canvasDimensions.height / 2;
    
    return {
      x: canvasCenterX + centeredX * scaleFactor,
      y: canvasCenterY + centeredY * scaleFactor
    };
  };

  // Scale a single coordinate
  const scaleCoordinate = (coord, isX) => {
    const bounds = templateBounds;
    const center = isX 
      ? (bounds.minX + bounds.maxX) / 2
      : (bounds.minY + bounds.maxY) / 2;
    const canvasCenter = isX
      ? canvasDimensions.width / 2
      : canvasDimensions.height / 2;
    
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

  // Reset states when shape changes
  const resetStates = () => {
      setProgress(0);
      setCurrentPathIndex(0);
      setUserLines([]);
      setIsScored(false);
      setScoreData(null);
      setShowHeatmap(false);
      setLineAccuracy({});
      setCursorMode("default");
      setShowScoreOverlay(false);
  };

  // Animate guide dot
  const animateGuide = (currentShape) => {
    if (!currentShape) return;
    
    setIsAnimating(true);
    setCurrentPathIndex(0);
    setProgress(0);
    setCursorMode("guiding");
    animatePath(0, currentShape);
  };

  // Animate a single path
  const animatePath = (pathIndex, currentShape) => {
    if (!currentShape || pathIndex >= currentShape.shapes.length) {
      setIsAnimating(false);
      setCursorMode("default");
      return;
    }

    setCurrentPathIndex(pathIndex);
    let startTime = performance.now();
    let duration = 5000 / animationSpeed;

    const animate = (time) => {
      if (!currentShape) {
        cancelAnimationFrame(animate);
        setIsAnimating(false);
        setCursorMode("default");
        return;
      }

      let elapsed = (time - startTime) / duration;
      
      if (elapsed > 1) {
        setProgress(1);
        setTimeout(() => {
          if (pathIndex + 1 < currentShape.shapes.length) {
            animatePath(pathIndex + 1, currentShape);
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
  const checkDrawingAccuracy = (x, y, currentShape) => {
    if (!currentShape || !realtimeFeedback) return "neutral";
    
    let minDistance = Infinity;
    let bestAccuracy = "neutral";
    
    currentShape.shapes.forEach((templateShape) => {
      if (!templateShape || !templateShape.points) return;
      
      const THRESHOLD_EXCELLENT = 5 * scaleFactor;
      const THRESHOLD_GOOD = 15 * scaleFactor;
      
      const scaledPoints = scalePoints(templateShape.points);
      
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

  const getCurrentTemplateStrokeWidth = (currentShape) => {
    if (!currentShape || currentPathIndex >= currentShape.shapes.length) {
      return 4 * scaleFactor;
    }
    return (currentShape.shapes[currentPathIndex].strokeWidth || 4) * scaleFactor;
  };

  // Updated handlers to work with scaled points
  const handleMouseDown = (e, currentShape) => {
    if (isAnimating) return;
    setIsDrawing(true);
    setCursorMode("drawing");
    const pos = e.target.getStage().getPointerPosition();
    
    const templateStrokeWidth = getCurrentTemplateStrokeWidth(currentShape);
    
    const lineId = Date.now().toString();
    setUserLines((prev) => [...prev, { 
      id: lineId, 
      points: [pos.x, pos.y],
      strokeWidth: templateStrokeWidth
    }]);
    
    const accuracy = checkDrawingAccuracy(pos.x, pos.y, currentShape);
    
    setLineAccuracy(prev => ({
      ...prev,
      [lineId]: accuracy
    }));
  };

  const handleMouseMove = (e, currentShape) => {
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
    
    if (realtimeFeedback && userLines.length > 0) {
      const accuracy = checkDrawingAccuracy(point.x, point.y, currentShape);
      const currentLineId = userLines[userLines.length - 1].id;
      
      setLineAccuracy(prev => {
        let newAccuracy = prev[currentLineId] || "neutral";
        
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

  // Get the next box for a shape based on its position in the sequence
  const getNextBox = (shapeIndex) => {
    if ((shapeIndex%SHAPES.length === 4 || shapeIndex%SHAPES.length == 5 ) && boxes[BOX_TYPES.CRYSTAL].length > 0) {
      return BOX_TYPES.CRYSTAL;
    } else if ((shapeIndex %SHAPES.length === 8|| shapeIndex %SHAPES.length == 9 ) && boxes[BOX_TYPES.DIAMOND].length > 0) {
      return BOX_TYPES.DIAMOND;
    }
    else if (boxes[BOX_TYPES.CARBON].length > 0) {
      return BOX_TYPES.CARBON;
    } 
    else if (boxes[BOX_TYPES.CRYSTAL].length > 0) {
      return BOX_TYPES.CRYSTAL;
    }
    else if (boxes[BOX_TYPES.DIAMOND].length > 0) {
      return BOX_TYPES.DIAMOND;
    }
    return BOX_TYPES.CARBON;
  };

  // Move a shape to a new box
  const moveShapeToBox = (shapeId, targetBox) => {
    const currentBox = Object.entries(boxes).find(([_, shapes]) => 
      shapes.some(shape => shape.id === shapeId)
    )?.[0];

    let animationClass = '';
    
    if (currentBox === targetBox) {
      animationClass = 'moving-top-to-bottom';
    } else if (
      (currentBox === BOX_TYPES.CARBON && targetBox === BOX_TYPES.CRYSTAL) ||
      (currentBox === BOX_TYPES.CRYSTAL && targetBox === BOX_TYPES.DIAMOND)
    ) {
      animationClass = 'moving-left-to-right';
    } else if (
      (currentBox === BOX_TYPES.DIAMOND && targetBox === BOX_TYPES.CRYSTAL) ||
      (currentBox === BOX_TYPES.CRYSTAL && targetBox === BOX_TYPES.CARBON)
    ) {
      animationClass = 'moving-right-to-left';
    }

    setMovingShape({ id: shapeId, targetBox, animationClass });
    
    setTimeout(() => {
      setBoxes(prevBoxes => {
        const newBoxes = { ...prevBoxes };
        
        // Remove from current box
        Object.keys(newBoxes).forEach(box => {
          newBoxes[box] = newBoxes[box].filter(shape => shape.id !== shapeId);
        });
        
        // Add to target box
        newBoxes[targetBox] = [...newBoxes[targetBox], { id: shapeId, box: targetBox }];
        
        return newBoxes;
      });
      
      setMovingShape(null);
    }, 500); // Match animation duration
  };

  // Update shape position based on score
  const updateShapePosition = (shapeId, score) => {
    const currentBox = Object.entries(boxes).find(([_, shapes]) => 
      shapes.some(shape => shape.id === shapeId)
    )?.[0];

    if (!currentBox) return;

    let targetBox;
    if (score >= 60) {
      if (currentBox === BOX_TYPES.CARBON) {
        targetBox = BOX_TYPES.CRYSTAL;
      } else if (currentBox === BOX_TYPES.CRYSTAL) {
        targetBox = BOX_TYPES.DIAMOND;
      } else {
        targetBox = BOX_TYPES.DIAMOND;
      }
    } else {
      if (currentBox === BOX_TYPES.CARBON) {
        targetBox = BOX_TYPES.CARBON;
      } else if (currentBox === BOX_TYPES.CRYSTAL) {
        targetBox = BOX_TYPES.CARBON;
      } else {
        targetBox = BOX_TYPES.CRYSTAL;
      }
    }

    moveShapeToBox(shapeId, targetBox);
  };

  // Modified calculateScore function to update shape position
  const calculateScore = (currentShape) => {
    if (!currentShape || userLines.length === 0) {
      alert("Please draw your shape first!");
      return;
    }

    const scaledTemplateShapes = currentShape.shapes.map(shape => ({
      ...shape,
      points: scalePoints(shape.points)
    }));

    const result = calculateAccuracy(scaledTemplateShapes, userLines);
    setScoreData(result);
    setIsScored(true);
    setShowScoreOverlay(true);
    
    // Update shape position based on score
    updateShapePosition(currentShape.id, result.score);
    
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

  const moveToNextShape = () => {
    if (currentShapeIndex < SHAPES.length - 1) {
      setCurrentShapeIndex(prev => prev + 1);
      setShowScoreOverlay(false);
    } else {
      setIsGameComplete(true);
      setShowGameComplete(true);
    }
  };

  const retryCurrentShape = () => {
    resetStates();
  };

  const getCurrentShape = () => { 
    let boxname = getNextBox(currentShapeIndex);   
   
    let current_shape = null;
    if (boxname === "diamond") {
      current_shape =  boxes[BOX_TYPES.DIAMOND][0];
    } else if (boxname === "crystal") {
      current_shape= boxes[BOX_TYPES.CRYSTAL][0];
    } else {
      current_shape = boxes[BOX_TYPES.CARBON][0];
    }  

    if (current_shape == null){
      return [];
    }
    return savedShapes.find(shape => shape.id === current_shape.id);
   
  }; 

  const getCurrentId = () => {
    let boxname = getNextBox(currentShapeIndex);   
   
    let current_shape = null;
    if (boxname === "diamond") {
      current_shape =  boxes[BOX_TYPES.DIAMOND][0];
    } else if (boxname === "crystal") {
      current_shape= boxes[BOX_TYPES.CRYSTAL][0];
    } else {
      current_shape = boxes[BOX_TYPES.CARBON][0];
    }  
    return current_shape&&current_shape.id;
  }

  const renderScoreOverlay = (moveToNextShape) => {
    if (!showScoreOverlay || !scoreData) return null;
    
    return (
      <div className="score-overlay">
        <div className="score-overlay-content">
          <h2>Tracing Score</h2>
          <div className="score-result">
            <div className="score-circle">
              <span className="score-number">{scoreData.score}%</span>
            </div>
            <p className="score-feedback">
              {scoreData.score >= 90 ? "Excellent! Your drawing is nearly perfect!" :
               scoreData.score >= 75 ? "Great job! Your drawing is very good." :
               scoreData.score >= 60 ? "Good work! Keep practicing to improve." :
               scoreData.score >= 40 ? "Nice try! Practice will make it better." :
               "Keep practicing! You'll get better with time."}
            </p>
          </div>
          
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
            <button 
              onClick={() => moveToNextShape()}
              className="next-shape-btn"
            >
              Move to Next
            </button>
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

  const renderPracticeArea = ({ currentShape, moveToNextShape, retryCurrentShape, isGameComplete }) => {
    if (!currentShape) {
      return (
        <div className="practice-area">
          <div className="loading-message">Loading shape data...</div>
        </div>
      );
    }

    return (
      <div className="practice-area" ref={containerRef}>
        <div className="practice-controls">
          {currentShape && (
            <>
              <div className="button-group">
                <button
                  className="guide-btn"
                  onClick={() => animateGuide(currentShape)}
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
                  onClick={() => calculateScore(currentShape)}
                  disabled={userLines.length === 0 || isScored}
                >
                  Calculate Score
                </button>  
              </div>
              
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
              <TamilAudioPlayer 
                ref={audioPlayerRef}
                selectedShapeId={currentShape?.id} 
              />
            </>
          )}   
        </div>
   
        <div className="canvas-container">
          <Stage
            width={canvasDimensions.width}
            height={canvasDimensions.height}
            ref={stageRef}
            onMouseDown={(e) => handleMouseDown(e, currentShape)}
            onMouseMove={(e) => handleMouseMove(e, currentShape)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={(e) => handleMouseDown(e, currentShape)}
            onTouchMove={(e) => handleMouseMove(e, currentShape)}
            onTouchEnd={handleMouseUp}
            className="practice-canvas"
            style={{ cursor: getCursorStyle() }}
          >
            <Layer>
              {currentShape?.shapes?.map((shape, i) => (
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
              
              {userLines.map((line, i) => (
                <Line
                  key={`user-${i}`}
                  points={line.points}
                  stroke="rgba(217, 239, 48, 0.7)"
                  strokeWidth={line.strokeWidth || (4 * scaleFactor)}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.5}
                  bezier={true}
                />
              ))}
              
              {currentShape && isAnimating && currentShape.shapes?.[currentPathIndex] && (
                (() => {
                  const shape = currentShape.shapes[currentPathIndex];
                  const scaledPoints = scalePoints(shape.points);
                  const { x, y } = getInterpolatedPoint(scaledPoints, progress);
                  return (
                    <>
                      <Circle 
                        x={x} 
                        y={y} 
                        radius={10 * Math.sqrt(scaleFactor)}
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
              
              {showHeatmap && renderHeatmap()} 
            </Layer>
          </Stage> 
          {renderScoreOverlay(moveToNextShape)}
        </div>
      </div>
    );
  };

  const renderGameComplete = () => {
    if (!showGameComplete) return null;

    return (
      <div className="game-complete-overlay">
        <div className="game-complete-content">
          <h2>Game Complete!</h2>
          <p>Congratulations! You've completed all the shapes!</p>
          <button onClick={() => {
            setCurrentShapeIndex(0);
            setIsGameComplete(false);
            setShowGameComplete(false);
            resetStates();
          }}>Play Again</button>
        </div>
      </div>
    );
  };
  console.log(getCurrentId());
  // Render the boxes
  const renderBoxes = () => {
    return (
      <div className="boxes-container">
        {Object.entries(boxes).map(([boxType, shapes]) => (
          <div key={boxType} className={`shape-box ${boxType}-box`}>
            <h3>{boxType.charAt(0).toUpperCase() + boxType.slice(1)}</h3>
            <div className="shape-list">
              {shapes.map(shape => (
                <div
                  key={shape.id}
                  className={`shape-item ${shape.id === getCurrentId() ? 'active' : ''} ${
                    movingShape?.id === shape.id ? movingShape.animationClass : ''
                  }`}
                >
                  {shape.id}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  useEffect(() => {
    renderBoxes();
  }, [getCurrentId]);
  const renderStartOverlay = () => {
    if (isGameStarted) return null;
    return (
      <div className="start-overlay">
        <div className="start-overlay-content">
          <h2>Welcome to Tamil Letter Tracing!</h2>
          <p>Practice writing Tamil letters by following the guide.</p>
          <button 
            onClick={() => setIsGameStarted(true)}
            className="start-game-btn"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="shapes-list">
      {!isGameComplete && (
        <>
          {!isGameStarted && renderStartOverlay()}
          <div className="shape-info">
            <h2>Shape {currentShapeIndex + 1} of {SHAPES.length}</h2>
          </div>
    
      <div className="game-area"> 
      {renderPracticeArea({
            currentShape: getCurrentShape(),
            moveToNextShape,
            retryCurrentShape,
            isGameComplete
          })}
          {renderBoxes()}
      </div>
        </>
      )}
      {renderGameComplete()}
    </div>
  );
};

export default ShapesList;
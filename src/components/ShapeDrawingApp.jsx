import React, { useState, useRef, useCallback } from "react";
import { Stage, Layer, Line } from "react-konva";
import { useNavigate } from "react-router-dom";
import { saveShapes, downloadShapesAsJSON  } from "../utils/database";

import { ShapesProvider, useShapes } from '../contexts/ShapesContext';


const ShapeDrawingApp = () => {
  const [lines, setLines] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState("pen"); // pen, eraser
  const [strokeWidth, setStrokeWidth] = useState(3);
  const stageRef = useRef(null);
  const navigate = useNavigate();
  const { refreshShapes } = useShapes(); 

  const handleDownload = () => {
    downloadShapesAsJSON();
  }; 

  // Start drawing a new line
  const startDrawing = useCallback((pos) => {
    if (!pos) return;
    setDrawing(true);
    setLines((prevLines) => [...prevLines, { 
      points: [pos.x, pos.y],
      tool: tool,
      strokeWidth: strokeWidth
    }]);
  }, [tool, strokeWidth]);

  // Continue drawing an existing line
  const continueDrawing = useCallback((pos) => {
    if (!drawing || !pos) return;
    setLines((prevLines) => {
      const newLines = [...prevLines];
      const lastLine = newLines[newLines.length - 1];

      if (lastLine) {
        lastLine.points = [...lastLine.points, pos.x, pos.y];
        newLines[newLines.length - 1] = { ...lastLine }; // Ensuring immutability
      }
      return newLines;
    });
  }, [drawing]);

  // End the current drawing stroke
  const endDrawing = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    // Save current state to history for undo
    setHistory((prevHistory) => [...prevHistory, [...lines]]);
    // Clear redo stack since we've made a new action
    setRedoStack([]);
  }, [drawing, lines]);

  // Handle mouse down event on the canvas
  const handleMouseDown = useCallback((e) => {
    if (e.evt.button !== 0) return; // Only left click
    const pos = e.target.getStage().getPointerPosition();
    startDrawing(pos);
  }, [startDrawing]);


  // Handle mouse move event on the canvas
  const handleMouseMove = useCallback((e) => {
    const pos = e.target.getStage().getPointerPosition();
    continueDrawing(pos);
  }, [continueDrawing]);

  // Handle touch start event for mobile
  const handleTouchStart = useCallback((e) => {
    e.evt.preventDefault();
    const pos = e.target.getStage().getPointerPosition();
    startDrawing(pos);
  }, [startDrawing]);

  // Handle touch move event for mobile
  const handleTouchMove = useCallback((e) => {
    e.evt.preventDefault();
    const pos = e.target.getStage().getPointerPosition();
    continueDrawing(pos);
  }, [continueDrawing]);

  // Undo the last drawn line
  const handleUndo = useCallback(() => {
    if (lines.length === 0) return;
    
    // Push current state to redo stack
    setRedoStack((prevRedoStack) => [...prevRedoStack, [...lines]]);
    
    if (history.length > 0) {
      // Restore the previous state from history
      const previousState = history[history.length - 1];
      setLines(previousState);
      // Remove that state from history
      setHistory((prevHistory) => prevHistory.slice(0, -1));
    } else {
      // If no history, clear the canvas
      setLines([]);
    }
  }, [lines, history]);

  // Redo a previously undone action
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    // Get the last item from redo stack
    const nextState = redoStack[redoStack.length - 1];
    
    // Push current state to history
    setHistory((prevHistory) => [...prevHistory, [...lines]]);
    
    // Apply the state from redo stack
    setLines(nextState);
    
    // Remove that state from redo stack
    setRedoStack((prevRedoStack) => prevRedoStack.slice(0, -1));
  }, [lines, redoStack]);

  // Reset the canvas
  const handleReset = useCallback(() => {
    setLines([]);
    setHistory([]);
    setRedoStack([]);
  }, []);

  // Save the current drawing
  const handleSave = useCallback(async () => {
    const name = prompt("Enter a name for your drawing:");
    if (name) {
      try {
        await saveShapes(name, lines); 
      
        alert(`Drawing "${name}" saved successfully!`);
        refreshShapes(); // Update the shapes list
        // navigate("/shapes");
      } catch (error) {
        console.error("Error saving drawing:", error);
        alert("Failed to save drawing. Please try again.");
      }
    }
  }, [lines, navigate, refreshShapes]);

  return (
    <div className="drawing-app">
      <h1>Draw the Shape and Save it</h1>
      <div className="tools">
        <div className="tool-group">
          <button 
            className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
            onClick={() => setTool('pen')}
          >
            Pen
          </button>
          {/* <button 
            className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
          >
            Eraser
          </button> */}
        </div>
        
        <div className="stroke-width">
          <label>Stroke Width:</label>
          <input 
            type="range" 
            min="1" 
            max="10" 
            value={strokeWidth} 
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
          />
          <span>{strokeWidth}px</span>
        </div>
      </div>
      
      <Stage
        width={900}
        height={500}
        ref={stageRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={endDrawing}
        className="drawing-canvas"
      >
        <Layer>
          {lines.map((line, i) => (
            <Line 
              key={i} 
              points={line.points} 
              stroke={line.tool === 'eraser' ? '#ffffff' : '#000000'}
              strokeWidth={line.strokeWidth || 2}
              lineCap="round" 
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
              tension={0.5}
              bezier={true}
            />
          ))}
        </Layer>
      </Stage>
      
      <div className="controls">
        <button onClick={handleUndo} disabled={lines.length === 0 && history.length === 0}>
          Undo
        </button>
        <button onClick={handleRedo} disabled={redoStack.length === 0}>
          Redo
        </button>
        <button onClick={handleReset} disabled={lines.length === 0}>
          Reset
        </button>
        <button onClick={handleSave} disabled={lines.length === 0}>
          Save
        </button>
        <button onClick={() => navigate("/shapes")}>
          go to Practice 
        </button> 
        <button onClick={handleDownload} disabled={lines.length === 0} >Download Shapes JSON</button>
      </div>
    </div>
  );
};

export default ShapeDrawingApp;
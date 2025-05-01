import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Define the levels and their shapes
const LEVELS = [
  {
    id: 1,
    name: "Level 1 - Basic Shapes",
    shapes: ['a', 'aa', 'e', 'ee', 'oa', 'ow'] ,
    description: "Learn the basic Tamil vowels"
  },
  {
    id: 2,
    name: "Level 2 - Intermediate Shapes",
    shapes: ['ka', 'ba', 'da', 'la'],
    description: "Practice with consonant-vowel combinations"
  },
  {
    id: 3,
    name: "Level 3 - Advanced Shapes",
    shapes: ['kaa', 'may', 'ke', 'so'],
    description: "Master more complex Tamil characters"
  }
];

const LevelManager = ({ children }) => {
  const [currentLevel, setCurrentLevel] = useState(null);
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const navigate = useNavigate();

  // Add styles
  const styles = {
    levelSelectionOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    levelSelectionContent: {
      backgroundColor: 'white',
      padding: '2rem',
      borderRadius: '8px',
      textAlign: 'center',
      minWidth: '300px',
    },
    levelDropdown: {
      width: '100%',
      padding: '0.5rem',
      marginTop: '1rem',
      fontSize: '1rem',
      borderRadius: '4px',
      border: '1px solid #ccc',
    },
  };

  // Reset level state when level changes
  useEffect(() => {
    if (currentLevel) {
      setCurrentShapeIndex(0);
      setIsLevelComplete(false);
      setShowLevelComplete(false);
    }
  }, [currentLevel]);

  const startLevel = (levelId) => {
    const level = LEVELS.find(l => l.id === levelId);
    if (level) {
      setCurrentLevel(level);
    }
  };

  const moveToNextShape = () => {
    if (currentLevel && currentShapeIndex < currentLevel.shapes.length - 1) {
      setCurrentShapeIndex(prev => prev + 1);
      setIsLevelComplete(false);
      setShowLevelComplete(false);
    } else {
      setIsLevelComplete(true);
      setShowLevelComplete(true);
    }
  };

  const retryCurrentShape = () => {
    // Reset any shape-specific state here
  };

  const moveToNextLevel = () => {
    if (currentLevel && currentLevel.id < LEVELS.length) {
      startLevel(currentLevel.id + 1);
    } else {
      // Game completed, reset to level selection
      setCurrentLevel(null);
      setCurrentShapeIndex(0);
      setIsLevelComplete(false);
      setShowLevelComplete(false);
    }
  };

  const retryCurrentLevel = () => {
    setCurrentShapeIndex(0);
    setIsLevelComplete(false);
    setShowLevelComplete(false);
  };

  const getCurrentShape = () => {
    if (!currentLevel) return null;
    return currentLevel.shapes[currentShapeIndex];
  };

  const renderLevelSelection = () => {
    if (currentLevel) return null;

    return (
      <div style={styles.levelSelectionOverlay}>
        <div style={styles.levelSelectionContent}>
          <h2>Select a Level</h2>
          <select 
            style={styles.levelDropdown}
            onChange={(e) => startLevel(parseInt(e.target.value))}
            defaultValue=""
          >
            <option value="" disabled>Choose a level...</option>
            {LEVELS.map(level => (
              <option key={level.id} value={level.id}>
                {level.name} - {level.description}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const renderLevelComplete = () => {
    if (!showLevelComplete) return null;

    return (
      <div className="level-complete-overlay">
        <div className="level-complete-content">
          <h2>Level Complete!</h2>
          <p>Congratulations! You've completed {currentLevel.name}</p>
          <div className="level-complete-actions">
            <button onClick={retryCurrentLevel}>Retry Level</button>
            {currentLevel.id < LEVELS.length ? (
              <button onClick={moveToNextLevel}>Next Level</button>
            ) : (
              <button onClick={() => {
                setCurrentLevel(null);
                setCurrentShapeIndex(0);
                setIsLevelComplete(false);
                setShowLevelComplete(false);
              }}>Finish Game</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="level-manager">
      {renderLevelSelection()}
      {currentLevel && (
        <>
          <div className="level-info">
            <h2>{currentLevel.name}</h2>
            <p>Shape {currentShapeIndex + 1} of {currentLevel.shapes.length}</p>
          </div>
          {children({
            currentShape: getCurrentShape(),
            moveToNextShape,
            retryCurrentShape,
            isLevelComplete
          })}
        </>
      )}
      {renderLevelComplete()}
    </div>
  );
};

export default LevelManager; 
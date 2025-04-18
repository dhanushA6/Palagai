import React, { createContext, useState, useContext, useEffect } from 'react';
import { loadShapes } from '../utils/database';

const ShapesContext = createContext();

export const ShapesProvider = ({ children }) => {
  const [savedShapes, setSavedShapes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load shapes on initial render
  useEffect(() => {
    const fetchShapes = async () => {
      try {
        const shapes = await loadShapes();
        setSavedShapes(shapes);
      } catch (error) {
        console.error('Error loading shapes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShapes();
  }, []);

  // Refresh the shapes list
  const refreshShapes = async () => {
    setLoading(true);
    try {
      const shapes = await loadShapes();
      setSavedShapes(shapes);
    } catch (error) {
      console.error('Error refreshing shapes:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ShapesContext.Provider value={{ savedShapes, loading, refreshShapes }}>
      {children}
    </ShapesContext.Provider>
  );
};

export const useShapes = () => useContext(ShapesContext);

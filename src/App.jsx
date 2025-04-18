import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ShapeDrawingApp from "./components/ShapeDrawingApp";
import ShapesList from "./components/ShapesList";
import { ShapesProvider } from "./contexts/ShapesContext";
import "./styles/index.css";

const App = () => {
  return (
    <Router>
      <ShapesProvider>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<ShapeDrawingApp />} />
            <Route path="/shapes" element={<ShapesList />} />
          </Routes>
        </div>
      </ShapesProvider>
    </Router>
  );
};

export default App;
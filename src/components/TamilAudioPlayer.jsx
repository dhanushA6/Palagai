import React, { useState, useEffect, useRef } from 'react';

const TamilAudioPlayer = ({ selectedShapeId }) => {
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const autoPlayTimeoutRef = useRef(null);
  
  // Reset states when selected shape changes
  useEffect(() => {
    setAudioLoaded(false);
    setIsPlaying(false);
    setError(null);
    
    // Clear any existing timeout
    if (autoPlayTimeoutRef.current) {
      clearTimeout(autoPlayTimeoutRef.current);
    }
    
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Set up auto-play with delay if a shape is selected
    if (selectedShapeId) {
      // We'll set up the auto-play after the audio is loaded
      // (see handleAudioLoaded function)
    }
    
    // Cleanup function
    return () => {
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
      }
    };
  }, [selectedShapeId]);
  
  // Handle audio load
  const handleAudioLoaded = () => {
    setAudioLoaded(true);
    setError(null);
    
    // Set playback rate to slow down the audio based on selectedShapeId length
    if (audioRef.current && selectedShapeId) {
      // Use slower playback rate (0.08) for single characters, faster (0.15) for others
      if (selectedShapeId.length === 1) {
        audioRef.current.playbackRate = 0.1;
      } else {
        audioRef.current.playbackRate = 0.15;
      }
      
      // Increase the volume (0 = silent, 1 = normal, 2 = double volume)
      audioRef.current.volume = 1.0; // Set to maximum safe volume
    }
    
    // Set up auto-play with a 1 second delay
    autoPlayTimeoutRef.current = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error("Auto-play failed:", err));
      }
    }, 1000);
  };
  
  // Handle audio load error
  const handleAudioError = () => {
    setAudioLoaded(false);
    setError("Could not load audio for this letter.");
  };
  
  // Play audio with reduced speed
  const playAudio = () => {
    if (audioRef.current && audioLoaded) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };
  
  // Update state when audio ends
  const handleAudioEnded = () => {
    setIsPlaying(false);
  };
  
  // Format the letter name for display
  const formatLetterName = (id) => {
    if (!id) return "";
    
    // Remove any file extension if present
    let name = id.split('.')[0];
    
    // Replace underscores with spaces and capitalize first letter
    name = name.replace(/_/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  
  return (
    <div className="bg-gray-100 mt-4 p-3 rounded-lg border border-gray-300">
      {selectedShapeId && (
        <>
          <audio
            ref={audioRef}
            src={`src/assets/audio/Ezhutholi_MP3/${selectedShapeId}.mp3`}
            onLoadedData={handleAudioLoaded}
            onError={handleAudioError}
            onEnded={handleAudioEnded}
          />
          
          <div className="flex items-center justify-between flex-wrap">
            <div className="text-lg font-medium text-gray-800 mr-4">
              {formatLetterName(selectedShapeId)}
            </div>
            
            <button 
              className={`flex items-center px-4 py-2 rounded-md text-white ${
                isPlaying 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors`}
              onClick={playAudio}
              disabled={!audioLoaded || isPlaying}
            >
              {isPlaying ? 'Playing...' : 'Listen'}
              <span className="ml-2 text-lg">
                {isPlaying ? '🔊' : '▶️'}
              </span>
            </button>
          </div>
          
          {error && (
            <div className="text-red-600 mt-2 text-sm w-full">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TamilAudioPlayer;
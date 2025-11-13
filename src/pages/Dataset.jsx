import React, { useState, useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- MediaPipe Constants (Must match Detection.jsx for consistency) ---
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// --- HELPER FUNCTION: Normalizes keypoints for scale and position invariance ---
// The wrist (index 0) is used as the reference point (origin).
const normalizeKeypoints = (keypoints) => {
    if (keypoints.length !== 21) {
        return [];
    }
    const wrist = keypoints[0];
    return keypoints.map(kp => ({
        x: kp.x - wrist.x,
        y: kp.y - wrist.y,
        z: kp.z - wrist.z,
    }));
};


const Dataset = () => {
  // 1. Refs for DOM elements and MediaPipe instance
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);

  // 2. State for Data Collection and UI
  const [currentHand, setCurrentHand] = useState('RIGHT'); // RIGHT or LEFT
  const [currentLetter, setCurrentLetter] = useState(''); // The sign label (e.g., 'A')
  const [currentVersion, setCurrentVersion] = useState(1); // The version number (e.g., 1, 2, 3)
  const [allDataset, setAllDataset] = useState([]); // Array of { label: 'RIGHT A 1', keypoints: [...] }
  const [status, setStatus] = useState('Initializing...');
  
  // State for real-time display of unnormalized keypoints
  const [liveKeypoints, setLiveKeypoints] = useState([]);
  const [detectedHand, setDetectedHand] = useState(null); // The hand detected by MediaPipe (user-mirrored)

  // --- Download Function (Saves entire collected dataset) ---
  const handleDownloadDataset = () => {
    if (allDataset.length === 0) {
        alert('Dataset is empty. Record some signs first!');
        return;
    }

    try {
        // Filename is dataset.json, as requested
        const jsonContent = JSON.stringify(allDataset, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.href = url;
        downloadAnchorNode.download = `dataset.json`;

        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();

        document.body.removeChild(downloadAnchorNode);
        URL.revokeObjectURL(url);
        
        setStatus(`Successfully downloaded dataset.json (${allDataset.length} signs).`);

    } catch (error) {
        console.error("Download failed:", error);
        setStatus(`Download failed: Check console for errors.`);
    }
  };

  // 3. MediaPipe & Camera Initialization (Runs once on mount)
  useEffect(() => {
    setStatus('Initializing MediaPipe...');

    handsRef.current = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    handsRef.current.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    handsRef.current.onResults(onResults);

    if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
            onFrame: async () => {
                await handsRef.current.send({ image: videoRef.current });
            },
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
        });
        camera.start().then(() => {
            setStatus('Ready. Enter sign details and click CAPTURE.');
        }).catch(err => {
            setStatus('Error starting camera. Check permissions.');
            console.error(err);
        });
    }

    return () => {
      if (handsRef.current) {
        handsRef.current.close();
      }
    };
  }, []);

  // 4. MediaPipe Results Handler (Runs per frame)
  const onResults = (results) => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

    // Apply Mirroring to the Canvas Context for user-friendly view
    canvasCtx.translate(VIDEO_WIDTH, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT); 

    let latestKeypoints = [];
    let handedness = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const rawHandedness = results.multiHandedness[0].label; // MediaPipe's perspective

      // INVERT THE HANDEDNESS LABEL to match the mirrored display
      handedness = rawHandedness === 'Left' ? 'Right' : (rawHandedness === 'Right' ? 'Left' : rawHandedness); 
      setDetectedHand(handedness);
      
      // Draw visualization
      drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
      drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
        
      // Extract keypoints
      latestKeypoints = landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
    } else {
        setDetectedHand(null);
    }

    // Prepare data for rendering on screen (formatting to 4 decimal places)
    const displayKeypoints = latestKeypoints.map((kp, index) => ({
        id: index,
        x: kp.x.toFixed(4),
        y: kp.y.toFixed(4),
        z: kp.z.toFixed(4),
    }));
    setLiveKeypoints(displayKeypoints);
    
    // Display the CORRECTED hand type on the canvas
    if (handedness && canvasCtx) {
        // Undo the flip before drawing text so it's not backwards
        canvasCtx.translate(VIDEO_WIDTH, 0);
        canvasCtx.scale(-1, 1);

        canvasCtx.fillStyle = 'yellow';
        canvasCtx.font = '24px Arial';
        canvasCtx.fillText(`Hand: ${handedness}`, 10, 30);
        
        // Redo the flip for the next frame's drawing 
        canvasCtx.translate(VIDEO_WIDTH, 0);
        canvasCtx.scale(-1, 1);
    }

    canvasCtx.restore();
  };


  // 5. Action Handler: Capture and Save
  const handleCaptureAndSave = () => {
    const trimmedLetter = currentLetter.trim().toUpperCase();
    const label = `${currentHand} ${trimmedLetter} ${currentVersion}`;
    
    if (trimmedLetter === '' || currentVersion < 1) {
        alert('Please enter a Letter and a valid Version number (starting from 1).');
        return;
    }
    
    if (liveKeypoints.length === 0) {
        setStatus(`Error: No hand detected. Please position your hand correctly for '${label}'.`);
        return;
    }

    // Optional: Check if the detected hand matches the selected hand for the label
    if (detectedHand && detectedHand.toUpperCase() !== currentHand.toUpperCase()) {
        const confirm = window.confirm(`Detected hand is ${detectedHand}, but label is ${currentHand}. Do you want to save anyway? (Click Cancel to fix the hand/label)`);
        if (!confirm) return;
    }


    // Convert formatted display keypoints back to raw numbers (un-normalized)
    const rawKeypoints = liveKeypoints.map(kp => ({
        x: parseFloat(kp.x),
        y: parseFloat(kp.y),
        z: parseFloat(kp.z),
    }));
    
    // **CRUCIAL STEP: NORMALIZE KEYPOINTS BEFORE SAVING TO ENSURE DISTANCE-INVARIANCE**
    const normalizedKeypoints = normalizeKeypoints(rawKeypoints);

    if (normalizedKeypoints.length === 0) {
        setStatus(`Error: Normalization failed for '${label}'.`);
        return;
    }
    
    // Save the new entry to the dataset
    const newEntry = { label: label, keypoints: normalizedKeypoints };

    setAllDataset(prevDataset => {
        // Check if label already exists and remove the old entry if it does
        const filteredDataset = prevDataset.filter(d => d.label !== label);
        
        const updatedDataset = [...filteredDataset, newEntry];

        // Sort for cleaner display/file structure
        updatedDataset.sort((a, b) => a.label.localeCompare(b.label));

        // Update the 'last captured' state for a visual check (optional)
        // setLastCapturedKeypoints(normalizedKeypoints); // Keeping this commented for a cleaner save

        // Advance the version number automatically for the next capture of the same sign
        setCurrentVersion(prev => prev + 1);
        
        setStatus(`Normalized keypoints for sign '${label}' captured and saved! Total entries: ${updatedDataset.length}.`);
        return updatedDataset;
    });
  };

  const currentLabel = `${currentHand} ${currentLetter.trim().toUpperCase()} ${currentVersion}`;
  const signsCount = allDataset.filter(d => d.label.startsWith(`${currentHand} ${currentLetter.trim().toUpperCase()}`)).length;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#e0f7fa' }}>
      <h1>Sign Language Dataset Creator (Multi-Sample Mode)</h1>
      <p>**New Label Format:** `HAND LETTER VERSION` (e.g., `RIGHT A 1`, `LEFT B 3`)</p>
      
      <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #000', backgroundColor: '#fff', width: '640px' }}>
          <strong>Status:</strong> {status}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Hidden video element */}
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted />
        
        {/* Canvas for visualization */}
        <canvas 
          ref={canvasRef} 
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
          style={{ border: '3px solid black', backgroundColor: '#000' }}
        />
        
        {/* Keypoint Display Panel (Shows UN-NORMALIZED points for debugging) */}
        <div style={{ width: '300px', border: '1px solid #ddd', padding: '10px', backgroundColor: '#fff' }}>
          <h3 style={{ marginTop: '0' }}>Real-Time Keypoints (21 Points)</h3>
          <p style={{fontSize: '10px'}}>Hand detected: **{detectedHand || 'N/A'}**</p>
          {liveKeypoints.length > 0 ? (
            <div style={{ maxHeight: '420px', overflowY: 'scroll', fontSize: '11px', lineHeight: '1.4' }}>
              {liveKeypoints.map(kp => (
                <div key={kp.id}>
                  **Point {kp.id.toString().padStart(2, '0')}**: 
                  X: {kp.x}, Y: {kp.y}, Z: {kp.z}
                </div>
              ))}
            </div>
          ) : (
            <p>No hand detected in the current frame.</p>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        
        {/* Input Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <strong>Hand:</strong>
                <select 
                    value={currentHand}
                    onChange={(e) => setCurrentHand(e.target.value)}
                    style={{ padding: '8px', border: '2px solid black' }}
                >
                    <option value="RIGHT">RIGHT</option>
                    <option value="LEFT">LEFT</option>
                </select>
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <strong>Letter/Sign:</strong>
                <input 
                    type="text" 
                    value={currentLetter} 
                    onChange={(e) => {
                        setCurrentLetter(e.target.value.toUpperCase());
                        setCurrentVersion(1); // Reset version when letter changes
                    }} 
                    placeholder="e.g., A or B"
                    style={{ padding: '8px', border: '2px solid black' }}
                />
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <strong>Version:</strong>
                <input 
                    type="number" 
                    value={currentVersion} 
                    onChange={(e) => setCurrentVersion(parseInt(e.target.value) || 1)}
                    min="1"
                    placeholder="e.g., 1, 2, 3"
                    style={{ padding: '8px', width: '100%', border: '2px solid black' }}
                />
            </label>
        </div>

        <p style={{ fontWeight: 'bold' }}>Next Sign to Save: {currentLabel}</p>
        
        <button 
          onClick={handleCaptureAndSave} 
          disabled={liveKeypoints.length === 0 || currentLetter.trim() === ''}
          style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Capture & Save Normalized Keypoints for '{currentLabel}'. (Current Count: {signsCount})
        </button>

        <h3 style={{ marginTop: '20px' }}>Collected Data Summary</h3>
        <p>Total Unique Entries Saved: **{allDataset.length}** (Normalized & Ready for Detection)</p>
        
        <button onClick={handleDownloadDataset} disabled={allDataset.length === 0} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Download Full Dataset ({allDataset.length} entries) as dataset.json
        </button>
      </div>
    </div>
  );
};

export default Dataset;
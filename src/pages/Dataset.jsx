// Dataset.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { addDoc, collection, getDocs, deleteDoc, doc } from 'firebase/firestore'; 
import { db, COLLECTION_NAME } from '../firebase'; 

// --- MediaPipe Constants (SEQUENCE MODE CONFIGURATION) ---
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// --- NEW CALCULATED TARGETS (BASED ON USER REQUEST) ---
const TARGET_DURATION_MS = 3000; // 3 seconds duration
const BASE_FPS = 24; // Standard expected FPS
const BASE_SAMPLE_RATE = 10; // New sampling rate: ONLY EVERY 10TH FRAME IS USED
const TARGET_FRAME_COUNT = 7; // = 7 samples
const VECTOR_LENGTH = TARGET_FRAME_COUNT * 21 * 3; // = 441
const ZERO_KEYPOINT = { x: 0, y: 0, z: 0 }; 

// --- MODIFIED FOR NEW REQUIREMENTS ---
// The fixed limit of 5 is removed.
// The average vector will now be identified by a string label.
const AVERAGE_VERSION_IDENTIFIER = 'AVERAGE'; 

// --- HELPER FUNCTION: Normalizes keypoints for scale and position invariance ---
const normalizeKeypoints = (keypoints) => {
    // If it's a zero-keypoint frame (from non-detection/padding), skip normalization.
    if (keypoints.length !== 21 || keypoints.every(kp => kp.x === 0 && kp.y === 0 && kp.z === 0)) {
        return keypoints; 
    }
    
    const wrist = keypoints[0];
    
    // Translate all points relative to the wrist (P0)
    return keypoints.map(kp => ({
        x: kp.x - wrist.x,
        y: kp.y - wrist.y,
        z: kp.z - wrist.z,
    }));
};

// --- HELPER FUNCTION: Flattens a 3D keypoint structure into a 1D vector ---
const flattenKeypoints = (normalizedFrames) => {
    const vector = [];
    normalizedFrames.forEach(frame => { 
        frame.forEach(kp => {           
            vector.push(kp.x, kp.y, kp.z); 
        });
    });
    // Ensure floating point precision and consistency
    return vector.map(v => parseFloat(v.toFixed(6))); 
};

// --- NEW HELPER FUNCTION: Mirrors the normalized 1D vector (simulates other hand) ---
// Since coordinates are relative to the wrist (P0) at (0,0,0), mirroring across 
// the vertical plane only requires negating the X (horizontal) and Z (depth) coordinates.
const mirrorVector = (sourceVector) => {
    // Check if it's the expected length
    if (sourceVector.length !== VECTOR_LENGTH) {
        console.error("Mirror Vector: Incorrect vector length for mirroring.");
        return [...sourceVector];
    }
    
    const mirrored = []; 
    // The vector is [x1, y1, z1, x2, y2, z2, ...] (441 elements total)
    for (let i = 0; i < sourceVector.length; i += 3) {
        const x = sourceVector[i];
        const y = sourceVector[i + 1];
        const z = sourceVector[i + 2];

        // Negate X and Z
        mirrored.push(parseFloat((-x).toFixed(6)));
        mirrored.push(parseFloat(y.toFixed(6))); // Y remains the same
        mirrored.push(parseFloat((-z).toFixed(6)));
    }
    return mirrored;
};


const Dataset = () => {
  // 1. Refs for DOM elements and MediaPipe instance
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);

  // 1b. Refs for Capture Control
  const isCapturingRef = useRef(false);
  const captureBufferRef = useRef([]); // Stores sampled raw keypoints during capture (Target size: 7)
  const timeoutIdRef = useRef(null); // Stores the setTimeout ID for the 3-second limit
  const incomingFrameCounterRef = useRef(0); // Tracks ALL incoming frames from MediaPipe
  const captureParamsRef = useRef(null); // Stores hand/letter/version when capture starts

  // Dynamic Sampling Control
  const samplesTakenRef = useRef(0);
  const actualFPSRef = useRef(BASE_FPS); // Assume base FPS initially
  const targetGapRef = useRef(BASE_SAMPLE_RATE); // Dynamic sampling rate (starts at 10)
  const lastTimeRef = useRef(performance.now());


  // 2. State for Data Collection and UI
  const [currentHand, setCurrentHand] = useState('RIGHT');
  const [currentLetter, setCurrentLetter] = useState('');
  const [currentVersion, setCurrentVersion] = useState(1);
  const [status, setStatus] = useState('Initializing...');
  const [totalEntries, setTotalEntries] = useState(0); 
  const [dataEntries, setDataEntries] = useState([]); // To store fetched data for display
  
  const [liveKeypoints, setLiveKeypoints] = useState([]);
  const [detectedHand, setDetectedHand] = useState(null); 
  const [captureProgress, setCaptureProgress] = useState(0); 
  const [isProcessing, setIsProcessing] = useState(false); 


  // --- Helper to get initial total count from Firestore ---
  const fetchTotalEntries = async () => {
      try {
          const vectorsCollection = collection(db, COLLECTION_NAME);
          const snapshot = await getDocs(vectorsCollection);
          
          const entries = snapshot.docs.map(doc => ({
              id: doc.id, // Store Firestore document ID for deletion
              ...doc.data()
          }));
          
          setDataEntries(entries); // Store the full list
          setTotalEntries(entries.length); 
          return entries;
      } catch (error) {
          console.error("Error fetching total entries:", error);
          setStatus("Error fetching total entries from Firestore.");
          return [];
      }
  };

  // --- Deletion Handler ---
  const handleDeleteEntry = async (id, label) => {
      if (!window.confirm(`Are you sure you want to delete the entry: ${label}?`)) {
          return;
      }
      try {
          setStatus(`Deleting entry: ${label}...`);
          await deleteDoc(doc(db, COLLECTION_NAME, id));
          
          const updatedEntries = await fetchTotalEntries(); // Re-fetch the list
          setStatus(`Successfully deleted entry: ${label}. Total entries: ${updatedEntries.length}.`);
          
          // Recalculate next version number
          updateNextVersion(currentHand, currentLetter.trim().toUpperCase(), updatedEntries);
          
      } catch (error) {
          console.error("Error deleting entry:", error);
          setStatus(`ERROR: Failed to delete entry ${label}.`);
      }
  };

  // --- Helper to calculate and set the next version number ---
  const updateNextVersion = (hand, letter, entries) => {
      if (!letter) {
          setCurrentVersion(1);
          return;
      }
      
      const maxVersion = entries
          .filter(e => e.label.startsWith(`${hand} ${letter}`))
          .map(e => {
              const versionPart = e.label.split(' ')[2];
              // Filter out the 'AVERAGE' entry and parse numerical versions
              const versionNum = parseInt(versionPart);
              return isNaN(versionNum) ? 0 : versionNum; // Use 0 for non-numerical versions (like 'AVERAGE')
          })
          .reduce((max, current) => Math.max(max, current), 0);
          
      setCurrentVersion(maxVersion + 1);
  }
  
  // --- Calculates and stores the average vector (as 'AVERAGE') ---
  const handleCalculateAndStoreAverage = async () => {
      const trimmedLetter = currentLetter.trim().toUpperCase();
      const signKey = `${currentHand} ${trimmedLetter}`;
      
      // Filter only the individual vectors (those with numerical version labels)
      const individualVectors = dataEntries.filter(e => {
          if (!e.label.startsWith(signKey)) return false;
          const versionPart = e.label.split(' ')[2];
          return !isNaN(parseInt(versionPart)); // Check if the version part is a number
      });
      
      if (individualVectors.length === 0) {
          alert(`Error: Cannot average. Need at least one individual vector (V1, V2, etc.) for ${signKey}. Found: 0`);
          return;
      }

      setStatus(`Calculating average vector for ${signKey} (${AVERAGE_VERSION_IDENTIFIER})...`);
      
      // 1. Calculate Average Vector
      const numVectors = individualVectors.length;
      const avgVector = new Array(VECTOR_LENGTH).fill(0);

      individualVectors.forEach(v => {
          v.keypoints.forEach((kp, i) => {
              avgVector[i] += kp;
          });
      });

      for (let i = 0; i < VECTOR_LENGTH; i++) {
          avgVector[i] = parseFloat((avgVector[i] / numVectors).toFixed(6));
      }
      
      // 2. Store the new entry to Firestore
      try {
          // Label will now include the identifier 'AVERAGE'
          const averageLabel = `${signKey} ${AVERAGE_VERSION_IDENTIFIER}`; 
          const newEntry = { 
              label: averageLabel, 
              keypoints: avgVector,
              vectorLength: VECTOR_LENGTH, 
              timestamp: new Date().toISOString()
          };
          await addDoc(collection(db, COLLECTION_NAME), newEntry);

          // 3. Update display data
          const updatedEntries = await fetchTotalEntries(); 
          
          setStatus(`SUCCESS! Average VECTOR for sign '${averageLabel}' saved to Firestore. Total entries: ${updatedEntries.length}.`);
          
      } catch (error) {
          setStatus(`ERROR: Failed to save average vector to Firestore. Check console.`);
          console.error("Firestore Save Error:", error);
      }
  };
  
  // --- NEW: Handles mirroring and saving a vector for the opposite hand ---
  const handleMirrorEntry = async (entry) => {
      const parts = entry.label.split(' ');
      const sourceHand = parts[0];
      const letter = parts[1];
      const version = parts[2];
      
      const targetHand = sourceHand === 'RIGHT' ? 'LEFT' : 'RIGHT';
      const targetLabel = `${targetHand} ${letter} ${version}`;

      if (!window.confirm(`Generate mirrored vector for '${entry.label}' as '${targetLabel}'?`)) {
          return;
      }
      
      setStatus(`Generating mirrored vector for ${entry.label}...`);

      // 1. Check for existence to prevent duplication
      const exists = dataEntries.some(e => e.label === targetLabel);
      if (exists) {
          alert(`Error: The mirrored vector '${targetLabel}' already exists. Please delete the existing one first.`);
          setStatus(`Ready.`);
          return;
      }

      // 2. Apply the mirroring transformation
      const mirroredVector = mirrorVector(entry.keypoints);
      
      // 3. Store the new entry to Firestore
      try {
          const newEntry = { 
              label: targetLabel, 
              keypoints: mirroredVector,
              vectorLength: VECTOR_LENGTH, 
              timestamp: new Date().toISOString()
          };
          await addDoc(collection(db, COLLECTION_NAME), newEntry);

          // 4. Update display data
          const updatedEntries = await fetchTotalEntries(); 
          
          setStatus(`SUCCESS! Mirrored VECTOR for sign '${targetLabel}' saved to Firestore. Total entries: ${updatedEntries.length}.`);
          
      } catch (error) {
          setStatus(`ERROR: Failed to save mirrored vector to Firestore. Check console.`);
          console.error("Firestore Save Error:", error);
      }
  };
  // 3. MediaPipe & Camera Initialization (Runs once on mount)
  useEffect(() => {
    setStatus('Initializing MediaPipe...');
    fetchTotalEntries(); 

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
            setStatus(`Ready. Target Samples: ${TARGET_FRAME_COUNT}. Vector Length: ${VECTOR_LENGTH}.`);
        }).catch(err => {
            setStatus('Error starting camera. Check permissions.');
            console.error(err);
        });
    }

    return () => {
      if (handsRef.current) {
        handsRef.current.close();
      }
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  // 4. MediaPipe Results Handler (Runs per frame)
  const onResults = (results) => {
    const now = performance.now();
    const deltaTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // --- Dynamic FPS and Sampling Rate Calculation ---
    if (isCapturingRef.current && incomingFrameCounterRef.current < (BASE_FPS * TARGET_DURATION_MS / 1000) * 2) { 
        if (deltaTime > 0) {
            const currentFPS = 1000 / deltaTime;
            actualFPSRef.current = actualFPSRef.current * 0.9 + currentFPS * 0.1; 
        }

        const totalFramesExpected = actualFPSRef.current * (TARGET_DURATION_MS / 1000);
        targetGapRef.current = Math.max(1, Math.round(totalFramesExpected / TARGET_FRAME_COUNT));
    }


    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    canvasCtx.translate(VIDEO_WIDTH, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT); 

    let latestKeypoints = [];
    let handedness = null;

    // --- CAPTURE LOGIC (Sampling based on dynamic gap) ---
    incomingFrameCounterRef.current++;
    const isSampleFrame = incomingFrameCounterRef.current % targetGapRef.current === 0;

    const handDetected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    if (handDetected) {
      const landmarks = results.multiHandLandmarks[0];
      const rawHandedness = results.multiHandedness[0].label; 

      handedness = rawHandedness === 'Left' ? 'Right' : (rawHandedness === 'Right' ? 'Left' : rawHandedness); 
      setDetectedHand(handedness);
      
      // Draw visualization
      drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
      drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
        
      // Extract raw keypoints
      latestKeypoints = landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
      
      if (isCapturingRef.current && isSampleFrame) {
            
          if (captureBufferRef.current.length < TARGET_FRAME_COUNT) {
              captureBufferRef.current.push(latestKeypoints);
              samplesTakenRef.current++;
          }
      
          const progress = Math.min(100, (captureBufferRef.current.length / TARGET_FRAME_COUNT) * 100);
          setCaptureProgress(progress);

          if (captureBufferRef.current.length >= TARGET_FRAME_COUNT) {
              console.log(`[Capture] Target frame count (${TARGET_FRAME_COUNT}) reached. Stopping early.`);
              handleStopCapture(); 
          }
      }

    } else {
        setDetectedHand(null);
        
        // If NO HAND DETECTED during capture, push a zero-keypoint frame placeholder
        if (isCapturingRef.current && isSampleFrame && captureBufferRef.current.length < TARGET_FRAME_COUNT) {
             const zeroFrame = new Array(21).fill(ZERO_KEYPOINT);
             captureBufferRef.current.push(zeroFrame);
             samplesTakenRef.current++;
        }
    }
    // --------------------------------------------

    // Prepare data for rendering on screen (UN-NORMALIZED)
    const displayKeypoints = latestKeypoints.map(kp => ({
        x: kp.x.toFixed(4),
        y: kp.y.toFixed(4),
        z: kp.z.toFixed(4),
    }));
    setLiveKeypoints(displayKeypoints);
    
    // Display hand type and progress on canvas
    if (canvasCtx) {
        canvasCtx.translate(VIDEO_WIDTH, 0);
        canvasCtx.scale(-1, 1);
        canvasCtx.fillStyle = 'yellow';
        canvasCtx.font = '24px Arial';
        canvasCtx.fillText(`Hand: ${handedness || 'N/A'}`, 10, 30);
        canvasCtx.fillText(`Samples: ${captureBufferRef.current.length}/${TARGET_FRAME_COUNT}`, 10, 60);
        canvasCtx.fillText(`Gap: ${targetGapRef.current} (FPS: ${Math.round(actualFPSRef.current)})`, 10, 90);
        canvasCtx.translate(VIDEO_WIDTH, 0);
        canvasCtx.scale(-1, 1);
    }

    canvasCtx.restore();
  };

  // 5. Capture Stop/Processing Handler
  const handleStopCapture = async () => {
    if (!isCapturingRef.current) return;

    isCapturingRef.current = false;
    clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = null;
    setCaptureProgress(0); 
    setIsProcessing(true);
    
    // --- Use Captured Parameters from Ref ---
    const capturedParams = captureParamsRef.current;
    if (!capturedParams || !capturedParams.letter) {
        setStatus(`ERROR: Capture parameters missing. Data discarded.`);
        captureBufferRef.current = [];
        setIsProcessing(false);
        return;
    }
    const { hand, letter, version } = capturedParams;
    const label = `${hand} ${letter} ${version}`;
    // --------------------------------------

    const sampledFramesCount = captureBufferRef.current.length;
    setStatus(`Capture complete. Processing ${sampledFramesCount} sampled frames for '${label}'...`);

    let framesToProcess = captureBufferRef.current;
    
    // 1. Truncate if too many frames were collected (Safety check)
    if (framesToProcess.length > TARGET_FRAME_COUNT) {
        framesToProcess = framesToProcess.slice(0, TARGET_FRAME_COUNT);
    }
    
    // 2. Pad with 21 zero-keypoint frames if frames are missing (low FPS)
    const missingFramesCount = TARGET_FRAME_COUNT - framesToProcess.length;
    if (missingFramesCount > 0) {
        const zeroKeypointFrame = new Array(21).fill(ZERO_KEYPOINT);
        for (let i = 0; i < missingFramesCount; i++) {
            framesToProcess.push(zeroKeypointFrame);
        }
        console.warn(`[Capture] Padded ${missingFramesCount} frames with zeros due to low FPS or early stop.`);
    }
    
    // 3. Normalize and Flatten
    const normalizedFrames = framesToProcess.map(normalizeKeypoints);
    const finalVector = flattenKeypoints(normalizedFrames);

    if (finalVector.length !== VECTOR_LENGTH) {
        setStatus(`Error: Final vector size mismatch! Expected ${VECTOR_LENGTH}, got ${finalVector.length}.`);
        captureBufferRef.current = [];
        setIsProcessing(false);
        return;
    }
    
    // 4. Store the new entry to Firestore
    try {
        const newEntry = { 
            label: label, 
            keypoints: finalVector,
            vectorLength: finalVector.length, 
            timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, COLLECTION_NAME), newEntry);

        // Update display data and counters
        const updatedEntries = await fetchTotalEntries(); 
        
        // Find the next available version number for the current letter/hand
        updateNextVersion(currentHand, currentLetter.trim().toUpperCase(), updatedEntries);
        
        setStatus(`SUCCESS! VECTOR for sign '${label}' saved to Firestore. Vector size: ${finalVector.length}. Total entries: ${updatedEntries.length}.`);
    } catch (error) {
        setStatus(`ERROR: Failed to save to Firestore. Check console.`);
        console.error("Firestore Save Error:", error);
    }

    captureBufferRef.current = []; 
    samplesTakenRef.current = 0;
    incomingFrameCounterRef.current = 0;
    targetGapRef.current = BASE_SAMPLE_RATE; // Reset sampling rate
    setIsProcessing(false);
  };

  // 6. Action Handler: Start Capture
  const handleStartCapture = () => {
    const trimmedLetter = currentLetter.trim().toUpperCase();
    
    if (trimmedLetter === '') {
        alert('Please enter a Letter/Sign.');
        return;
    }
    
    if (detectedHand && detectedHand.toUpperCase() !== currentHand.toUpperCase()) {
        const confirm = window.confirm(`Detected hand is ${detectedHand}, but label is ${currentHand}. Capture might be incorrect. Do you want to proceed?`);
        if (!confirm) return;
    }
    
    // --- LOGIC: Check for existing AVERAGE vector (blocks new individual vectors) ---
    const averageVectorExists = dataEntries.some(e => 
        e.label === `${currentHand} ${trimmedLetter} ${AVERAGE_VERSION_IDENTIFIER}`
    );
    
    if (averageVectorExists) {
        alert(`Cannot store a new individual vector. The ${AVERAGE_VERSION_IDENTIFIER} vector for ${currentHand} ${trimmedLetter} already exists. Please delete the '${AVERAGE_VERSION_IDENTIFIER}' vector to add more individual samples.`);
        return;
    }
    // ----------------------------------------------------------------------------------
    
    if (currentVersion < 1 || isNaN(currentVersion)) {
        alert('Internal Error: Invalid current version number.');
        return;
    }

    // --- CAPTURE PARAMS NOW ---
    captureParamsRef.current = {
        hand: currentHand,
        letter: trimmedLetter,
        version: currentVersion
    };
    // -------------------------

    // Reset all capture state
    isCapturingRef.current = true;
    captureBufferRef.current = [];
    incomingFrameCounterRef.current = 0; 
    samplesTakenRef.current = 0;
    targetGapRef.current = BASE_SAMPLE_RATE; // Start with base rate (10)
    setCaptureProgress(0);
    
    setStatus(`Recording ${TARGET_FRAME_COUNT} samples (target gap: ${BASE_SAMPLE_RATE}) over ${TARGET_DURATION_MS / 1000} seconds... KEEP SIGN STEADY!`);
    
    // Set a timer to stop the capture after TARGET_DURATION_MS (3 seconds)
    timeoutIdRef.current = setTimeout(handleStopCapture, TARGET_DURATION_MS);
  };

  const trimmedLetter = currentLetter.trim().toUpperCase();
  const currentLabel = `${currentHand} ${trimmedLetter} ${currentVersion}`;
  
  // Logic for the conditional average button and start button
  // Count of all vectors with a numerical version (individual samples)
  const individualVectorCount = dataEntries.filter(e => {
      if (!e.label.startsWith(`${currentHand} ${trimmedLetter}`)) return false;
      const versionPart = e.label.split(' ')[2];
      return !isNaN(parseInt(versionPart)); // Filter for numerical versions
  }).length;
  
  const averageVectorExists = dataEntries.some(e => 
      e.label === `${currentHand} ${trimmedLetter} ${AVERAGE_VERSION_IDENTIFIER}`
  );
  
  // Start button is disabled if capturing, processing, no letter, OR if average vector exists
  const isButtonDisabled = isCapturingRef.current || isProcessing || trimmedLetter === '' || averageVectorExists;

  // Show average button if there is at least 1 individual vector AND the average does not exist
  const showAverageButton = individualVectorCount > 0 && !averageVectorExists;

  // Calculate the next version number automatically when letter/hand changes
  useEffect(() => {
    updateNextVersion(currentHand, currentLetter.trim().toUpperCase(), dataEntries);
  }, [currentHand, currentLetter, dataEntries]); 

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#e0f7fa' }}>
      <h1>Sign Language Dataset Creator (Dynamic Sequence Mode)</h1>
      <p>**Goal:** Capture **{TARGET_FRAME_COUNT}** frames over {TARGET_DURATION_MS/1000} seconds. The **frame gap is dynamically adjusted** to maintain a fixed sequence length. Data is saved as a **Fixed-Length 1D Vector ({VECTOR_LENGTH})** to Firestore.</p>
      
      <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #000', backgroundColor: '#fff', width: '640px' }}>
          <strong>Status:</strong> {status}
          {isCapturingRef.current && (
             <div style={{ marginTop: '10px', height: '15px', border: '1px solid black', backgroundColor: '#eee' }}>
                <div style={{ width: `${captureProgress}%`, height: '100%', backgroundColor: '#28a745', transition: 'width 0.1s linear' }}></div>
            </div>
          )}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted />
        
        <canvas 
          ref={canvasRef} 
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
          style={{ border: '3px solid black', backgroundColor: '#000' }}
        />
        
        <div style={{ width: '300px', border: '1px solid #ddd', padding: '10px', backgroundColor: '#fff' }}>
          <h3 style={{ marginTop: '0' }}>Real-Time Keypoints (21 Points)</h3>
          <p style={{fontSize: '10px'}}>Hand detected: **{detectedHand || 'N/A'}**</p>
          {liveKeypoints.length > 0 ? (
            <div style={{ maxHeight: '420px', overflowY: 'scroll', fontSize: '11px', lineHeight: '1.4' }}>
              {liveKeypoints.map((kp, index) => (
                <div key={index}>
                  **Point {index.toString().padStart(2, '0')}**: 
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
        
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <strong>Hand:</strong>
                <select 
                    value={currentHand}
                    onChange={(e) => setCurrentHand(e.target.value)}
                    style={{ padding: '8px', border: '2px solid black' }}
                    disabled={isCapturingRef.current || isProcessing}
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
                        // Version update is handled by the useEffect hook
                    }} 
                    placeholder="e.g., A or B"
                    style={{ padding: '8px', border: '2px solid black' }}
                    disabled={isCapturingRef.current || isProcessing}
                />
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <strong>Next Version:</strong>
                <input 
                    type="number" 
                    value={currentVersion} 
                    onChange={(e) => setCurrentVersion(parseInt(e.target.value) || 1)}
                    min="1"
                    placeholder="e.g., 1, 2, 3"
                    style={{ padding: '8px', width: '100%', border: '2px solid black', backgroundColor: '#eee' }}
                    disabled={true} // Disable manual edit as it's now calculated
                />
            </label>
        </div>

        <p style={{ fontWeight: 'bold' }}>Next Sign to Save: {currentLabel}</p>
        <p style={{ fontWeight: 'bold', color: averageVectorExists ? 'red' : (individualVectorCount > 0 ? 'orange' : 'green') }}>
            Individual Vectors for {currentHand} {trimmedLetter}: **{individualVectorCount}** (Unlimited until AVERAGE is stored)
        </p>
        
        <button 
          onClick={handleStartCapture} 
          disabled={isButtonDisabled}
          style={{ padding: '10px 20px', backgroundColor: isButtonDisabled ? '#6c757d' : '#007bff', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isCapturingRef.current ? 
            `RECORDING... (${captureBufferRef.current.length}/${TARGET_FRAME_COUNT} Samples @ 1-in-${targetGapRef.current} rate)` : 
            isProcessing ? 
                "PROCESSING..." : 
                averageVectorExists ? 
                    `CAPTURE BLOCKED: ${AVERAGE_VERSION_IDENTIFIER} VECTOR EXISTS. DELETE IT TO ADD V${currentVersion}.` :
                    `START CAPTURE: Record ${TARGET_FRAME_COUNT} Samples (V${currentVersion}) over ${TARGET_DURATION_MS/1000}s`}
        </button>
        
        {showAverageButton && (
             <button 
                onClick={handleCalculateAndStoreAverage} 
                disabled={isProcessing}
                style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: 'black', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
             >
                 STORE VECTOR LABELLED **{AVERAGE_VERSION_IDENTIFIER}** (Average of {individualVectorCount} samples)
             </button>
        )}
        {averageVectorExists && (
            <p style={{ color: 'blue', fontWeight: 'bold' }}>Average Vector **{AVERAGE_VERSION_IDENTIFIER}** already exists.</p>
        )}

        <h3 style={{ marginTop: '20px' }}>Collected Data Summary (Firestore)</h3>
        <p>Total Sequence Entries Saved: **{totalEntries}** (Each entry is a {TARGET_FRAME_COUNT} frame sequence vector of length {VECTOR_LENGTH})</p>
        
        <button 
            onClick={fetchTotalEntries} 
            disabled={isCapturingRef.current || isProcessing}
            style={{ padding: '5px 10px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer', marginBottom: '10px' }}
        >
            Refresh Data List ({totalEntries} entries)
        </button>
        
        {/* NEW DATA DISPLAY TABLE */}
        <div style={{ maxHeight: '400px', overflowY: 'scroll', border: '1px solid #ccc', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f2f2f2' }}>
                        <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Label</th>
                        <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Vector Size</th>
                        <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Mirror Action</th>
                        <th style={{ padding: '8px', border: '1px solid #ccc', textAlign: 'left' }}>Delete Action</th>
                    </tr>
                </thead>
                <tbody>
                    {dataEntries.sort((a, b) => a.label.localeCompare(b.label)).map((entry) => (
                        <tr key={entry.id} style={{ backgroundColor: entry.label.endsWith(` ${AVERAGE_VERSION_IDENTIFIER}`) ? '#d4edda' : 'white' }}>
                            <td style={{ padding: '8px', border: '1px solid #ccc', fontWeight: entry.label.endsWith(` ${AVERAGE_VERSION_IDENTIFIER}`) ? 'bold' : 'normal' }}>
                                {entry.label}
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ccc' }}>{entry.vectorLength}</td>
                            <td style={{ padding: '8px', border: '1px solid #ccc' }}>
                                <button
                                    onClick={() => handleMirrorEntry(entry)}
                                    disabled={isCapturingRef.current || isProcessing}
                                    style={{ 
                                        padding: '4px 8px', 
                                        backgroundColor: '#17a2b8', // Info Blue
                                        color: 'white', 
                                        border: 'none', 
                                        cursor: 'pointer', 
                                        borderRadius: '4px',
                                        width: '100%'
                                    }}
                                >
                                    Generate Mirrored Hand Value
                                </button>
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ccc' }}>
                                <button
                                    onClick={() => handleDeleteEntry(entry.id, entry.label)}
                                    disabled={isCapturingRef.current || isProcessing}
                                    style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px', width: '100%' }}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default Dataset;
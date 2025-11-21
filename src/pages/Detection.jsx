import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowRight, FiZap, FiVolumeX, FiRefreshCcw, FiCheckCircle, FiXCircle, FiVideoOff } from 'react-icons/fi';

// --- MediaPipe Imports ---
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- VectorStore Import ---
import { SignVectorStore } from './VectorStore'; 

// --- MediaPipe Constants (Must match Dataset.jsx for fixed vector length) ---
const VIDEO_WIDTH = 640; 
const VIDEO_HEIGHT = 480;

// Sequence Constants (UPDATED to match new Dataset.jsx logic)
const TARGET_FRAME_COUNT = 7; // Fixed length of the sequence
const SAMPLE_RATE = 10; // <--- ONLY EVERY 10TH FRAME IS USED (Base rate for sampling check)
const VECTOR_LENGTH = TARGET_FRAME_COUNT * 21 * 3; // = 441
const ZERO_KEYPOINT = { x: 0, y: 0, z: 0 };


// --- DETECTION THRESHOLDS (Using Cosine Similarity) ---
const SIMILARITY_THRESHOLD = 0.70; // Cosine Similarity threshold (0.70 = 70%)
const MAX_ATTEMPT_TIME = 7000; // Time to attempt the sign (can remain 7s even if the sequence is 3s)

// --- HELPER FUNCTION: Normalizes keypoints for scale and position invariance (Copied from Dataset.jsx) ---
const normalizeKeypoints = (keypoints) => {
    if (keypoints.length !== 21) {
        return null;
    }
    const wrist = keypoints[0];
    return keypoints.map(kp => ({
        x: kp.x - wrist.x,
        y: kp.y - wrist.y,
        z: kp.z - wrist.z,
    }));
};

// --- HELPER FUNCTION: Flattens a 3D keypoint structure into a 1D vector (Copied from Dataset.jsx) ---
const flattenKeypoints = (normalizedFrames) => {
    const vector = [];
    normalizedFrames.forEach(frame => {
        frame.forEach(kp => {           
            vector.push(kp.x, kp.y, kp.z); 
        });
    });
    return vector; 
};

// --- CORE FUNCTION: Process collected frames into the fixed-length vector ---
const processSequenceToVector = (rawFrames) => {
    let framesToProcess = [...rawFrames]; // Copy the buffer
    
    // 1. Truncate if needed
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
    }

    // 3. Normalize each frame
    const normalizedFrames = framesToProcess.map(frame => {
        // Handle zero-keypoint frames (non-detected frames or padding)
        if (frame.every(kp => kp.x === 0 && kp.y === 0 && kp.z === 0)) {
            return frame; 
        }
        return normalizeKeypoints(frame);
    }).filter(kp => kp !== null);
    
    // 4. Flatten
    const finalVector = flattenKeypoints(normalizedFrames);

    if (finalVector.length !== VECTOR_LENGTH) {
        console.error(`Vector processing failed. Expected ${VECTOR_LENGTH}, got ${finalVector.length}.`);
        return null;
    }
    
    return finalVector;
};


// --- HINT LOGIC: (Simplified for Sequence Mode) ---
const getPositionalHint = () => {
    return 'Hold the sign steady while the sequence is being recorded (~3 seconds).'; // Updated to 3s
};

const getShapeHint = (score) => {
    if (score < 70) return 'The sequence match is low. Try holding the sign more consistently.';
    if (score < 95) return 'Almost there! Consistent movement is key.';
    return 'Perfect sequence consistency!'; 
};


// --- CUSTOM HOOK: useMediaPipeHandDetector (No changes, included for completeness) ---
const useMediaPipeHandDetector = (webcamRef, videoRef) => {
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [isWebcamError, setIsWebcamError] = useState(false);
    const [liveKeypoints, setLiveKeypoints] = useState([]); 
    const [handType, setHandType] = useState(null); 
    const handsRef = useRef(null);
    const canvasRef = useRef(null);
    const lastHandTypeRef = useRef(null);
    
    // Ref to track ALL incoming frames for sampling
    const incomingFrameCounterRef = useRef(0);
    
    // Function to handle MediaPipe results
    const onResults = (results) => {
        const canvasCtx = canvasRef.current.getContext('2d');
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT); 
        canvasCtx.translate(VIDEO_WIDTH, 0);
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        
        let rawKeypoints = [];
        let handedness = null;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const rawHandedness = results.multiHandedness[0].label; 

            // Invert Handedness for mirror effect
            handedness = rawHandedness === 'Left' ? 'Right' : (rawHandedness === 'Right' ? 'Left' : rawHandedness); 
            
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
            
            rawKeypoints = landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));

        } 

        setLiveKeypoints(rawKeypoints);
        if (handedness !== lastHandTypeRef.current) {
            setHandType(handedness);
            lastHandTypeRef.current = handedness;
        } else if (!handedness && handType !== null) {
             setHandType(null);
        }

        canvasCtx.restore(); 
    };

    // Initialization Logic
    useEffect(() => {
        setIsWebcamError(false);
        let camera = null;
        
        const canvas = document.createElement('canvas');
        canvas.width = VIDEO_WIDTH;
        canvas.height = VIDEO_HEIGHT;
        canvasRef.current = canvas;

        if (webcamRef.current) {
            webcamRef.current.innerHTML = ''; 
            webcamRef.current.appendChild(canvas);
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.objectFit = 'cover';
            canvas.style.borderRadius = '1.5rem'; 
        }

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
            handsRef.current.initialize().then(() => {
                camera = new Camera(videoRef.current, { 
                    onFrame: async () => {
                        incomingFrameCounterRef.current++; // <--- INCREMENTS ON EVERY FRAME
                        await handsRef.current.send({ image: videoRef.current });
                    },
                    width: VIDEO_WIDTH,
                    height: VIDEO_HEIGHT,
                });

                camera.start().then(() => {
                    setIsModelLoading(false);
                }).catch(error => {
                    console.error("Camera start failed:", error);
                    setIsWebcamError(true);
                    setIsModelLoading(false);
                });
            }).catch(error => {
                console.error("MediaPipe initialization failed:", error);
                setIsWebcamError(true);
                setIsModelLoading(false);
            });
        }


        return () => {
            if (handsRef.current) handsRef.current.close();
            if (camera) camera.stop();
        };
    }, [webcamRef, videoRef]);


    // Expose the total frame count for sampling in the component
    return { isModelLoading, isWebcamError, liveKeypoints, handType, incomingFrameCounter: incomingFrameCounterRef.current };
};


// --- HELPER COMPONENTS (No changes, included for completeness) ---
const Navbar = () => (
    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-start items-center z-20 relative">
        <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
            <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
        </div>
    </nav>
);

const AnimatedButton = ({ onClick, children, className = "", type = 'button', disabled = false, result = null }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-xl transition-all duration-300 transform border-4 border-gray-800";
    
    // Check if result is a boolean (true or false)
    const isSuccess = result === true;
    const isFailure = result === false;
    
    if (disabled && !isSuccess) {
        baseStyle += " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed";
    } else if (isSuccess) {
        baseStyle += " bg-teal-400 text-gray-800 shadow-[8px_8px_0px_#1f2937] hover:bg-teal-300";
    } else if (isFailure) {
        baseStyle += " bg-pink-500 text-white shadow-[8px_8px_0px_#1f2937] hover:bg-pink-400";
    } else {
        baseStyle += " bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[8px_8px_0px_#1f2937]";
    }

    const isDisabled = disabled && !isSuccess;

    return (
        <motion.button
            type={type}
            onClick={onClick}
            className={`${baseStyle} ${className} flex items-center justify-center relative overflow-hidden`}
            whileHover={!isDisabled ? { scale: 1.03, boxShadow: "12px 12px 0px #1f2937", y: -2, rotate: 1 } : {}} 
            whileTap={!isDisabled ? { scale: 0.95, boxShadow: "4px 4px 0px #1f2937", y: 0, rotate: -1 } : {}} 
            disabled={isDisabled}
        >
            {children}
        </motion.button>
    );
};

const WiggleStar = ({ size, position }) => (
    <motion.div
        className={`absolute text-${size} ${position} filter drop-shadow opacity-70`}
        animate={{ 
            rotate: [0, 30, -30, 0],
            scale: [1, 1.3, 1] 
        }}
        transition={{ 
            duration: 2.5, 
            repeat: Infinity, 
            ease: "easeInOut" 
        }}
    >
        ✨
    </motion.div>
);

const signVideos = {
    'A': 'https://v.ftcdn.net/02/56/49/00/700_F_256490033_wEjUPH9ngCatJZTRidpla1ML9SqEPoTB_ST.mp4',
    'B': 'https://v.ftcdn.net/02/56/49/09/700_F_256490938_gokVW30m5WmOOm9fYW0VPnzqvkADZ5k6_ST.mp4',
    'C': 'https://v.ftcdn.net/03/72/12/98/700_F_372129825_ogi8JWJAQZFGmecp7CPNnjOJRNh1sZQW_ST.mp4',
    'D': 'https://v.ftcdn.net/02/56/49/28/700_F_256492865_E6wfj8gSc1hNBh3VmkvM1a34ldAF3bC7_ST.mp4',
    'E': 'https://v.ftcdn.net/02/56/49/38/700_F_256493860_vZrSvpLC71Z3seHmIu9T9Y9ItlRgQcKB_ST.mp4',
    'F': 'https://v.ftcdn.net/02/56/49/46/700_F_256494637_8VWziV7A3QH1IB52YKuaOQj0MS2K0gHz_ST.mp4',
    'G': 'https://v.ftcdn.net/04/51/33/31/700_F_451333158_X3es3ekr2rOJ0gkEkAS8ClRMooAJQEZ4_ST.mp4',
    'H': 'https://v.ftcdn.net/02/56/49/61/700_F_256496110_3SuAe0VSHHTvXNIY6MilGoNyOW9Upojj_ST.mp4',
    'I': 'https://v.ftcdn.net/10/22/81/91/700_F_1022819113_2qPxCtY39jMRkTOIOm0lKAbDCKtLj47C_ST.mp4',
    'J': 'https://v.ftcdn.net/02/56/49/76/700_F_256497609_HfniMe27SEDmMQRVzXGYyCroUzIAxRL5_ST.mp4',
    'K': 'https://v.ftcdn.net/04/51/75/13/700_F_451751352_LbZyKjMRFVHenWSp8XvRr8C87hJPxt9m_ST.mp4',
    'L': 'https://v.ftcdn.net/04/51/33/31/700_F_451333156_VkW6U39AYbY39wbYwbsDJT0GR4HG6cPv_ST.mp4',
    'M': 'https://v.ftcdn.net/02/56/50/01/700_F_256500182_ghedqfv1DXwIsH0TlJtlpQHyOzHxmRaJ_ST.mp4',
    'N': 'https://v.ftcdn.net/04/51/33/31/700_F_451333159_p8rq5IqKuKcwxUFj6PeiREAT8wemaXSz_ST.mp4',
    'O': 'https://v.ftcdn.net/04/51/72/73/700_F_451727343_5ciMyeGJHWsB3dtomkBuhM1hTfNDtm6A_ST.mp4',
    'P': 'https://v.ftcdn.net/04/51/75/13/700_F_451751352_LbZyKjMRFVHenWSp8XvRr8C87hJPxt9m_ST.mp4',
    'Q': 'https://v.ftcdn.net/02/56/50/51/700_F_256505141_QgNcPntv88FNTSXDJEBtnvVMDpLGmWt3_ST.mp4',
    'R': 'https://v.ftcdn.net/03/26/51/11/700_F_326511157_YVVObGmUQZ2zUk3s4Sz0lrXoQJDeoqZC_ST.mp4',
    'S': 'https://v.ftcdn.net/02/56/50/75/700_F_256507583_dQRAmGF93QofGJjx0SDCHX5rY8P1Rutv_ST.mp4',
    'T': 'https://v.ftcdn.net/02/56/50/87/700_F_256508727_s7IeWZPSNyTZe7EznZhEjjjbbaPQPqt7_ST.mp4',
    'U': 'https://v.ftcdn.net/02/56/50/98/700_F_256509838_W6SXnyXgm3gKEyIER8UOwiNlUqoypYDC_ST.mp4',
    'V': 'https://v.ftcdn.net/02/56/51/11/700_F_256511113_mDvHFkxAdjN8QmD6CEIV01rDuAoC5Noi_ST.mp4',
    'W': 'https://v.ftcdn.net/02/56/51/25/700_F_256512526_VB7rl3srYkEQHh8xVvHGy7dLvvMb7pPT_ST.mp4',
    'X': 'https://v.ftcdn.net/04/51/72/76/700_F_451727694_uPg2poUMu8q0gQo21CiEPKyvsp1VQPoP_ST.mp4',
    'Y': 'https://v.ftcdn.net/03/72/12/97/700_F_372129723_UZuWwfDdj51lrodvl6yfKwt4lamYRrPm_ST.mp4',
    'Z': 'https://v.ftcdn.net/02/56/51/55/700_F_256515526_lQsX2PtDlBnZnCxFiILwpeJq1ecTrrkT_ST.mp4',
};
// --- End Helper Components ---


// --- Main Detection Component ---
const Detection = () => {
    const location = useLocation();
  
    const { userName = 'USER', nameLetters = ['A'] } = location.state || {};
    const processedNameLetters = userName.toUpperCase().split('');

    const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
    const currentLetter = processedNameLetters[currentLetterIndex] ? processedNameLetters[currentLetterIndex].toUpperCase() : 'A';
    
    const [isDetecting, setIsDetecting] = useState(false);
    const [result, setResult] = useState(null); // null | true | false
    const [countdown, setCountdown] = useState(3);
    const [currentScore, setCurrentScore] = useState(0); // Sequence Similarity Score (0-100)
    const [isVectorStoreLoading, setIsVectorStoreLoading] = useState(true);
    
    // NEW STATE: Tracks the specific reason for a 'false' result (Timeout or Wrong Sign)
    const [failureMessage, setFailureMessage] = useState(null); // null | 'TIMEOUT' | 'WRONG_SIGN:X' | 'NO_MATCH' 

    const [recordedSigns, setRecordedSigns] = useState([]);
    
    const navigate = useNavigate();
    
    const webcamContainerRef = useRef(null);
    const videoRef = useRef(null); 
    const failTimerRef = useRef(null); // Kept for consistency, but logic removed/changed
    const isSuccessTransitionRef = useRef(false); 

    // --- Sequence Matching Refs ---
    const sequenceBufferRef = useRef([]); // Stores sampled raw keypoints
    const isProcessingSequenceRef = useRef(false); // Flag to prevent multiple sequence processing
    
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    // --- Use MediaPipe Detector Hook ---
    const { isModelLoading, isWebcamError, liveKeypoints, handType, incomingFrameCounter } = useMediaPipeHandDetector(
        webcamContainerRef, 
        videoRef,
    );
    
    // --- VectorStore Initialization ---
    useEffect(() => {
        const initVectorStore = async () => {
            await SignVectorStore.loadFromFirebase();
            setIsVectorStoreLoading(false);
        };
        initVectorStore();
    }, []);

    // *** DYNAMICALLY CHOOSE TARGET LABELS BASED ON DETECTED HAND ***
    const baseLabel = handType ? handType.toUpperCase() : 'RIGHT'; 
    
    // Total variants available for the current sign (used for UI display)
    const targetVariantsCount = SignVectorStore.vectors.filter(v => 
        v.label.startsWith(`${baseLabel} ${currentLetter} `)
    ).length;

    
    // --- HINT LOGIC (Simplified for Sequence Mode) ---
    const positionalHint = isDetecting && countdown === 0 ? getPositionalHint() : '';
    const shapeHint = isDetecting && countdown === 0 ? getShapeHint(currentScore) : '';
    const finalHint = currentScore > 0 ? shapeHint : positionalHint; 

    const totalLetters = processedNameLetters.length;
    const progressPercent = ((currentLetterIndex) / totalLetters) * 100;
  
    // --- VIDEO RECORDING START/STOP LOGIC (No changes, included for completeness) ---
    useEffect(() => {
        if (isDetecting && countdown === 0) {
            if (videoRef.current && videoRef.current.captureStream && !mediaRecorderRef.current) {
                try {
                    const canvasElement = webcamContainerRef.current.querySelector('canvas');
                    const stream = canvasElement ? canvasElement.captureStream() : videoRef.current.captureStream();
                    recordedChunksRef.current = [];

                    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
                                     ? 'video/webm; codecs=vp9' 
                                     : MediaRecorder.isTypeSupported('video/webm; codecs=vp8')
                                     ? 'video/webm; codecs=vp8'
                                     : 'video/webm';

                    const recorder = new MediaRecorder(stream, { mimeType: mimeType });
                    mediaRecorderRef.current = recorder;

                    recorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            recordedChunksRef.current.push(event.data);
                        }
                    };

                    recorder.start(100); 
                    // console.log("MediaRecorder started...");

                } catch (error) {
                    console.error("Error starting MediaRecorder:", error);
                }
            }
        } else if (!isDetecting && mediaRecorderRef.current) {
            const recorder = mediaRecorderRef.current;
            
            if (recorder.state === 'recording' || recorder.state === 'paused') {
                recorder.stop();
                // console.log("MediaRecorder stopped.");

                recorder.onstop = () => {
                    if (result === true && recordedChunksRef.current.length > 0) {
                        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                        const videoUrl = URL.createObjectURL(blob);
                        
                        setRecordedSigns(prev => [
                            ...prev,
                            {
                                letter: currentLetter,
                                videoUrl: videoUrl,
                                score: currentScore,
                                baseLabel: baseLabel
                            }
                        ]);
                    }
                    
                    mediaRecorderRef.current = null;
                    recordedChunksRef.current = [];
                };
            } else {
                 mediaRecorderRef.current = null;
                 recordedChunksRef.current = [];
            }
        }
    }, [isDetecting, countdown, result, currentLetter, currentScore, baseLabel]);


    // 1. Countdown Effect (MAX_ATTEMPT_TIME logic removed, only countdown remains)
    useEffect(() => {
        // Clear any lingering timer from previous runs just in case (though it shouldn't fire now)
        if (failTimerRef.current) {
            clearTimeout(failTimerRef.current);
            failTimerRef.current = null;
        }
        
        if (!isDetecting || countdown === 0) return;
        
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0; 
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(timer);
            // failTimerRef logic removed here
        };
    }, [isDetecting, countdown]);


    // 2. --- CORE SEQUENCE SAMPLING & SINGLE MATCH LOGIC EFFECT ---
    useEffect(() => {
        if (isModelLoading || isWebcamError || isVectorStoreLoading || !isDetecting || countdown > 0 || !handType) {
            return;
        }

        // Sampling Logic: Only sample every 10th frame
        if (incomingFrameCounter % SAMPLE_RATE === 0) { // <--- CORE SAMPLING CHECK uses SAMPLE_RATE = 10
            
            // Determine keypoints for the frame (21 points or 21 zero placeholders)
            const keypointsForFrame = liveKeypoints.length === 21 
                                    ? liveKeypoints 
                                    : new Array(21).fill(ZERO_KEYPOINT);
            
            // Only push to buffer if we haven't reached the target count
            if (sequenceBufferRef.current.length < TARGET_FRAME_COUNT) { // TARGET_FRAME_COUNT = 7
                 sequenceBufferRef.current.push(keypointsForFrame);
            }

            // Sequence Complete: Process and Match
            if (sequenceBufferRef.current.length >= TARGET_FRAME_COUNT && !isProcessingSequenceRef.current) {
                isProcessingSequenceRef.current = true;
                
                // 1. Process the sampled frames into the final fixed-length vector (Length 441)
                const queryVector = processSequenceToVector(sequenceBufferRef.current);
                
                // 2. Reset the buffer and flag for the next sequence attempt (THIS IS THE ONLY RESET POINT)
                sequenceBufferRef.current = [];
                isProcessingSequenceRef.current = false;
                
                let isSuccessfulMatch = false;

                if (queryVector) {
                    // 3. Find Best Match using Cosine Similarity + Averaged Vectors
                    const bestMatch = SignVectorStore.findBestMatchAveraged(queryVector); 

                    if (bestMatch) {
                        const similarityScore = bestMatch.similarity;
                        const scorePercent = Math.round(similarityScore * 100);
                        setCurrentScore(scorePercent);
                        
                        const matchedLetter = bestMatch.label.split(' ')[1];
                        const matchedHand = bestMatch.label.split(' ')[0];
                        
                        const isTargetHand = matchedHand === handType.toUpperCase();
                        const isMatchCorrectLetter = (matchedLetter === currentLetter);
                        
                        // LOGIC: Check for a strong match (>= SIMILARITY_THRESHOLD, which is 0.70)
                        if (isTargetHand && isMatchCorrectLetter && similarityScore >= SIMILARITY_THRESHOLD) {
                            // SUCCESS
                            isSuccessfulMatch = true;
                            isSuccessTransitionRef.current = true;
                            setIsDetecting(false); 
                            setResult(true); 
                            setFailureMessage(null); // Clear any previous failure message
                            
                            const clearSuccessFlagTimer = setTimeout(() => {
                                isSuccessTransitionRef.current = false;
                            }, 1500);

                            return () => clearTimeout(clearSuccessFlagTimer);
                        } else if (isTargetHand && similarityScore >= SIMILARITY_THRESHOLD) {
                            // FAILURE: Strong match (>= 70%) to the WRONG letter 
                            console.log(`[Detection] Strong match to WRONG sign: ${bestMatch.label} (${scorePercent}%)`);
                            setFailureMessage(`WRONG_SIGN:${matchedLetter}`); // <-- SET FAILURE REASON
                            setCurrentScore(scorePercent); // Keep the score for display
                        } else {
                            // FAILURE: Not a strong match (low score or correct sign but low consistency)
                            console.log(`[Detection] Best match: ${bestMatch.label} (${scorePercent}%) - No match found.`);
                            setFailureMessage('NO_MATCH'); // <-- NEW FAILURE REASON
                            setCurrentScore(scorePercent); // Keep the score for display
                        }
                    } else {
                        setCurrentScore(0);
                        setFailureMessage('NO_MATCH');
                        console.log("[Detection] No match found or VectorStore empty.");
                    }
                } else {
                     setCurrentScore(0);
                     setFailureMessage('NO_MATCH');
                }
                
                // NEW LOGIC: If a successful match was NOT achieved, stop detecting immediately.
                if (!isSuccessfulMatch) {
                    setIsDetecting(false); 
                    setResult(false);
                }
            }
        }
    
    }, [liveKeypoints, isDetecting, countdown, handType, incomingFrameCounter, isModelLoading, isWebcamError, isVectorStoreLoading, currentLetter]);


    // Main Detection Action (Handles Start, Try Again, and Next Letter clicks)
    const handleDetectionAction = () => {
        // 1. Handle SUCCESS/NEXT button click
        if (result === true) {
            if (currentLetterIndex === processedNameLetters.length - 1) {
                navigate('/result', { state: { recordedSigns: recordedSigns, userName: userName, totalSignsAttempted: processedNameLetters.length } }); 
                return;
            }
            
            setCurrentLetterIndex(prev => prev + 1);
            setResult(null); 
            setCurrentScore(0); 
            setFailureMessage(null); // Clear failure message
            
            setIsDetecting(true);
            setCountdown(3); 
            return; 
        }

        // 2. Handle START/TRY AGAIN click (result is null or false)
        if (isModelLoading || isDetecting || isWebcamError || isVectorStoreLoading) return;

        if (SignVectorStore.vectors.length === 0) {
            alert(`Error: VectorStore is empty. Please ensure data is correctly stored in Firestore.`);
            return;
        }

        if (targetVariantsCount === 0) {
            alert(`Error: No dataset entries found for '${baseLabel} ${currentLetter}' in Firestore. Please record at least one version!`);
            return;
        }

        if (result !== null) setResult(null); 
        setFailureMessage(null); // Clear failure message
        
        if (failTimerRef.current) {
            clearTimeout(failTimerRef.current);
            failTimerRef.current = null;
        }
        
        // Reset sequence state
        sequenceBufferRef.current = [];
        isProcessingSequenceRef.current = false;

        setIsDetecting(true); 
        setCountdown(3);
    };


    const getButtonText = () => {
        if (isWebcamError) {
            return <><FiVideoOff className='mr-2' /> CAMERA BLOCKED! Enable & Refresh</>;
        }
        if (isModelLoading || isVectorStoreLoading) {
            return <><FiZap className='mr-2 animate-spin' /> Loading Hand Tracker/Vector Store...</>;
        }
        if (isDetecting) {
            if (countdown > 0) {
                 return `GET READY! (${countdown})`;
            }
            if (targetVariantsCount === 0) {
                return `ERROR: Data for ${baseLabel} ${currentLetter} NOT FOUND!`;
            }
            return `SIGN ${currentLetter} NOW! ANALYZING SEQUENCE...`;
        } else if (result === true) {
            if (currentLetterIndex === processedNameLetters.length - 1) {
                return <><FiCheckCircle className='mr-2' /> DONE! See Final Results</>;
            }
            return <><FiCheckCircle className='mr-2' /> PERFECT! Next Letter!</>;
        } else if (result === false) {
            // NEW LOGIC: Differentiate between Timeout/No Match and Wrong Sign
            if (failureMessage && failureMessage.startsWith('WRONG_SIGN')) {
                const wrongLetter = failureMessage.split(':')[1];
                return <><FiXCircle className='mr-2' /> WRONG SIGN! You signed {wrongLetter}. Try Again.</>;
            }
             // Covers NO_MATCH and old TIMEOUT (which is now just NO_MATCH after first sequence)
            return <><FiRefreshCcw className='mr-2' /> No Match Found! Try Again.</>;
        } 
        return <><FiZap className='mr-2' /> Start BOLO Sequence Check</>;
    };

    const getHeaderColor = (r) => {
        if (r === true) return 'bg-teal-600';
        if (r === false) return 'bg-pink-600';
        return 'bg-gray-800';
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 flex flex-col overflow-hidden relative border-8 border-gray-800">
            <Navbar />
            
            {/* Animated Decor Elements */}
            <WiggleStar key="star-tl" size="5xl" position="top-10 left-10" />
            <WiggleStar key="star-br" size="4xl" position="bottom-10 right-10" />

            <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full relative z-10">
                
                {/* Progress Bar */}
                <motion.div 
                    className="mb-8 p-4 border-4 border-gray-800 rounded-xl bg-white/90 shadow-[6px_6px_0px_#1f2937]"
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 150 }}
                >
                    <div className="flex justify-between mb-2 px-1 font-black text-gray-800 uppercase">
                        <span>BOLO Alphabet Challenge</span>
                        <span>{Math.round(progressPercent)}% COMPLETE</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 border-2 border-gray-800 overflow-hidden">
                        <motion.div 
                            className="h-full bg-gradient-to-r from-yellow-400 via-pink-500 to-teal-500"
                            initial={{ width: '0%' }}
                            animate={{ 
                                width: `${progressPercent}%`
                            }}
                            transition={{ duration: 1, ease: 'easeInOut' }}
                        />
                    </div>
                </motion.div>

                {/* --- DUAL CARD LAYOUT (ENLARGED) --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
                    {/* Left Side - Video Tutorial */}
                    <motion.div 
                        className="bg-white rounded-3xl shadow-xl border-4 border-gray-800 overflow-hidden lg:col-span-1"
                        initial={{ x: -100, rotate: -5, opacity: 0 }}
                        animate={{ x: 0, rotate: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 100 }}
                        whileHover={{ scale: 1.02, boxShadow: "15px 15px 0px #1f2937" }}
                    >
                        <div className={`${getHeaderColor(result)} p-4 border-b-4 border-gray-800`}>
                            <h2 className="text-2xl font-black text-white filter drop-shadow">WATCH: Letter {currentLetter}</h2>
                        </div>
                        
                        <div className="aspect-video bg-gray-900 flex items-center justify-center">
                            <video 
                                key={currentLetter} 
                                src={signVideos[currentLetter] || signVideos['A']} 
                                autoPlay 
                                loop 
                                muted 
                                className="w-full h-full object-contain bg-black"
                                playsInline
                            />
                        </div>
                        
                        <div className="p-6">
                            <div className="bg-yellow-100 p-4 rounded-xl border-2 border-gray-800">
                                <p className="text-lg font-black text-gray-800">BOLO TIP:</p>
                                <ul className="text-base text-gray-700 list-disc pl-5 mt-1">
                                    <li>Keep your wrist firm!</li>
                                    <li>Match the sequence consistently over the capture time!</li>
                                    <li>Target: <span className="font-bold text-pink-500">{baseLabel} {currentLetter} (Matching against {targetVariantsCount} variants)</span></li>
                                </ul>
                            </div>
                        </div>
                    </motion.div>
                    
                    {/* Right Side - Webcam / Detection Panel */}
                    <motion.div 
                        className="bg-white rounded-3xl shadow-xl border-4 border-gray-800 flex flex-col overflow-hidden lg:col-span-1"
                        initial={{ x: 100, rotate: 5, opacity: 0 }}
                        animate={{ x: 0, rotate: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 100, delay: 0.1 }}
                        whileHover={{ scale: 1.02, boxShadow: "15px 15px 0px #1f2937" }}
                    >
                        <div className={`${getHeaderColor(result)} p-4 border-b-4 border-gray-800`}>
                            <h2 className="text-2xl font-black text-white filter drop-shadow">YOUR TURN: Sign {currentLetter}</h2>
                        </div>
                        
                        {/* Webcam/Canvas Display Area */}
                        <div className="flex-1 bg-gray-900 flex items-center justify-center relative aspect-video overflow-hidden">
                            <video 
                                ref={videoRef} 
                                style={{ position: 'absolute', width: VIDEO_WIDTH, height: VIDEO_HEIGHT, transform: 'scaleX(-1)' }} 
                                autoPlay 
                                playsInline 
                                muted 
                                width={VIDEO_WIDTH}
                                height={VIDEO_HEIGHT}
                            />
                            
                            <div 
                                ref={webcamContainerRef} 
                                className="w-full h-full flex items-center justify-center bg-gray-800 absolute inset-0"
                            >
                                {/* MediaPipe Canvas is appended here by the hook */}
                            </div>
                            
                            <AnimatePresence>
                                {/* Loading State */}
                                {(isModelLoading || isVectorStoreLoading) && !isWebcamError && (
                                    <motion.div
                                        key="loading"
                                        className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <div className="text-center">
                                            <div className="text-6xl mb-4 text-white animate-pulse">📡</div>
                                            <p className="text-white text-xl font-bold">Loading Hand Tracker/Vector Store...</p>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Error State */}
                                {isWebcamError && (
                                    <motion.div
                                        key="error"
                                        className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-30"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <FiVideoOff className="text-6xl mb-4 text-pink-500" />
                                        <p className="text-pink-400 text-xl font-bold">CAMERA ACCESS BLOCKED</p>
                                        <p className="text-gray-300 text-sm mt-2">Please enable camera permissions in your browser settings and refresh the page.</p>
                                    </motion.div>
                                )}

                                {/* Feedback Banner */}
                                {(!isModelLoading && !isWebcamError && !isVectorStoreLoading) && (isDetecting || result !== null) && (
                                    <motion.div
                                        key="minimal-feedback"
                                        className="absolute top-0 inset-x-0 p-3 z-30 bg-gray-800/90 border-b-4 border-gray-800"
                                        initial={{ y: '-100%', opacity: 0 }}
                                        animate={{ y: '0%', opacity: 1 }}
                                        exit={{ y: '-100%', opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <div className="text-center">
                                            {isDetecting && countdown > 0 && (
                                                <p className="text-3xl font-black text-yellow-400">
                                                    GET READY: {countdown}
                                                </p>
                                            )}
                                            {isDetecting && countdown === 0 && (
                                                <p className="text-3xl font-black text-pink-400 animate-pulse">
                                                    ANALYZING SEQUENCE... {sequenceBufferRef.current.length}/{TARGET_FRAME_COUNT}
                                                </p>
                                            )}
                                            {result === true && (
                                                <p className="text-3xl font-black text-teal-400">
                                                    <FiCheckCircle className='inline mr-2' /> PERFECT!
                                                </p>
                                            )}
                                            {result === false && (
                                                <p className="text-3xl font-black text-pink-400">
                                                    <FiXCircle className='inline mr-2' /> 
                                                    {failureMessage && failureMessage.startsWith('WRONG_SIGN') ? 
                                                        `WRONG SIGN! (Matched ${failureMessage.split(':')[1]})` : 
                                                        'NO MATCH FOUND!'}
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Real-time score and hint display - THIS BLOCK HAS BEEN REMOVED */}
                            
                        </div>
                        
                        <div className="p-6">
                            <AnimatedButton
                                onClick={handleDetectionAction}
                                disabled={isDetecting || isModelLoading || isWebcamError || isVectorStoreLoading || (liveKeypoints.length === 0 && result === false && failureMessage === 'TIMEOUT')}
                                result={result}
                                className="w-full py-4 text-2xl font-black"
                            >
                                {getButtonText()}
                            </AnimatedButton>
                            
                            <div 
                                className="mt-4 flex items-center justify-between text-base text-gray-800 font-bold"
                            >
                                <span>Practicing: {userName}</span>
                                <span>Letter: {currentLetter} ({currentLetterIndex + 1}/{processedNameLetters.length})</span>
                            </div>
                        </div>
                    </motion.div>
                    
                </div>
                
                {/* Floating hand animation */}
                <motion.div 
                    className="fixed bottom-4 right-4 text-6xl z-10 filter drop-shadow-lg"
                    animate={{ 
                        rotate: [0, 10, -10, 10, 0],
                        y: [0, -20, 20, -20, 0]
                    }}
                    transition={{ 
                        repeat: Infinity, 
                        duration: 4,
                        ease: 'easeInOut'
                    }}
                >
                    🤟
                </motion.div>
            </div>
        </div>
    );
};

export default Detection;
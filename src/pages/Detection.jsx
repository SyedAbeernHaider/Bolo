import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowRight, FiZap, FiVolumeX, FiRefreshCcw, FiCheckCircle, FiXCircle, FiVideoOff } from 'react-icons/fi';

// --- MediaPipe Imports ---
import { Hands, POSE_LANDMARKS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- LOCAL DATASET IMPORT ---
import LOCAL_DATASET from '../dataset.json' ; 

// --- MediaPipe Constants (Must match Dataset.jsx for consistency) ---
const VIDEO_WIDTH = 640; 
const VIDEO_HEIGHT = 480;

const DISTANCE_THRESHOLD = 0.12; 
const MAX_ATTEMPT_TIME = 7000; 
const MAX_SCORING_DISTANCE = 0.35; 

// --- HELPER FUNCTION: Normalizes keypoints for scale and position invariance ---
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

// --- HELPER FUNCTION: Calculates the Euclidean Distance and returns the score component ---
const calculateDistanceAndScore = (liveKeypoints, targetKeypoints) => {
    if (liveKeypoints.length !== 21 || targetKeypoints.length !== 21) {
        return { distance: Infinity, score: 0, rawWristPosition: {x: 0.5, y: 0.5, z: 0} };
    }
    
    // 1. Normalize the live keypoints
    const normalizedLive = normalizeKeypoints(liveKeypoints);
    const normalizedTarget = targetKeypoints; 

    if (normalizedLive.length !== 21 || normalizedTarget.length !== 21) {
        return { distance: Infinity, score: 0, rawWristPosition: liveKeypoints[0] };
    }

    let sumOfSquaredDifferences = 0;
    
    for (let i = 0; i < 21; i++) { 
        const dx = normalizedLive[i].x - normalizedTarget[i].x;
        const dy = normalizedLive[i].y - normalizedTarget[i].y;
        const dz = normalizedLive[i].z - normalizedTarget[i].z;
        
        sumOfSquaredDifferences += (dx * dx) + (dy * dy) + (dz * dz);
    }

    const distance = Math.sqrt(sumOfSquaredDifferences);
    const clampedDistance = Math.min(distance, MAX_SCORING_DISTANCE);
    const score = Math.max(0, 100 - (clampedDistance / MAX_SCORING_DISTANCE) * 100);

    return { 
        distance, 
        score: Math.round(score),
        rawWristPosition: liveKeypoints[0]
    };
};

// --- HINT LOGIC: Generates feedback for the user ---
const getPositionalHint = (rawWristPosition) => {
    const center = { x: 0.5, y: 0.5 }; 
    const threshold = 0.2; 
    let xHint = '';
    let yHint = '';

    if (rawWristPosition.x < center.x - threshold) {
        xHint = 'Move Hand RIGHT';
    } else if (rawWristPosition.x > center.x + threshold) {
        xHint = 'Move Hand LEFT';
    }

    if (rawWristPosition.y < center.y - threshold) {
        yHint = 'Move Hand DOWN';
    } else if (rawWristPosition.y > center.y + threshold) {
        yHint = 'Move Hand UP';
    }
    
    if (rawWristPosition.z < -0.2) { 
         return 'Move Hand CLOSER';
    } else if (rawWristPosition.z > 0.2) {
         return 'Move Hand FARTHER';
    }

    if (xHint && yHint) return `${xHint} & ${yHint}`;
    if (xHint) return xHint;
    if (yHint) return yHint;
    
    return 'Great position! Focus on the shape.';
};

const getShapeHint = (score) => {
    if (score < 50) return 'The shape is far off. Try matching the tutorial video.';
    if (score < 75) return 'Almost there! Check your finger curls.';
    if (score < 90) return 'Close! Just slight adjustments needed.';
    return 'Perfect shape!'; 
};


// --- CUSTOM HOOK: useMediaPipeHandDetector ---
const useMediaPipeHandDetector = (webcamRef, videoRef) => {
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [isWebcamError, setIsWebcamError] = useState(false);
    const [liveKeypoints, setLiveKeypoints] = useState([]); 
    const [handType, setHandType] = useState(null); 
    const handsRef = useRef(null);
    const canvasRef = useRef(null);
    const lastHandTypeRef = useRef(null);
    
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


    const onResults = (results) => {
        const canvasCtx = canvasRef.current.getContext('2d');
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT); 
        
        // This causes the mirror effect for user display
        canvasCtx.translate(VIDEO_WIDTH, 0);
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const rawHandedness = results.multiHandedness[0].label; 

            // --- FIX FOR MIRRORING: INVERT THE HANDEDNESS ---
            const handedness = rawHandedness === 'Left' ? 'Right' : (rawHandedness === 'Right' ? 'Left' : rawHandedness); 
            
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
            
            const rawKeypoints = landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
            setLiveKeypoints(rawKeypoints);
            
            if (handedness !== lastHandTypeRef.current) {
                setHandType(handedness);
                lastHandTypeRef.current = handedness;
            }

        } else {
            if (liveKeypoints.length > 0) setLiveKeypoints([]);
            if (handType !== null) setHandType(null);
        }

        canvasCtx.restore(); 
    };

    return { isModelLoading, isWebcamError, liveKeypoints, handType };
};


// --- HELPER COMPONENTS (FIXING THE REFERENCE ERROR) ---
const Navbar = () => (
    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-start items-center z-20 relative">
        <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
            <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
        </div>
    </nav>
);

const AnimatedButton = ({ onClick, children, className = "", type = 'button', disabled = false, result = null }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-xl transition-all duration-300 transform border-4 border-gray-800";
    if (disabled && !(result === true)) {
        baseStyle += " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed";
    } else if (result === true) {
        baseStyle += " bg-teal-400 text-gray-800 shadow-[8px_8px_0px_#1f2937] hover:bg-teal-300";
    } else if (result === false) {
        baseStyle += " bg-pink-500 text-white shadow-[8px_8px_0px_#1f2937] hover:bg-pink-400";
    } else {
        baseStyle += " bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[8px_8px_0px_#1f2937]";
    }

    const isDisabled = disabled && !(result === true);

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

// --- Main Detection Component ---
const Detection = () => {
    const location = useLocation();
  
    const { userName = 'USER', nameLetters = ['A'] } = location.state || {};
    const processedNameLetters = userName.toUpperCase().split('');

    const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
    const currentLetter = processedNameLetters[currentLetterIndex] ? processedNameLetters[currentLetterIndex].toUpperCase() : 'A';
    
    const [isDetecting, setIsDetecting] = useState(false);
    const [result, setResult] = useState(null); 
    const [countdown, setCountdown] = useState(3);
    const [currentDistance, setCurrentDistance] = useState(Infinity); 
    const [currentScore, setCurrentScore] = useState(0);

    const [recordedSigns, setRecordedSigns] = useState([]);
    
    const navigate = useNavigate();
    
    const webcamContainerRef = useRef(null);
    const videoRef = useRef(null); 
    const failTimerRef = useRef(null); 
    const isSuccessTransitionRef = useRef(false); 
    
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    // --- Use MediaPipe Detector Hook ---
    const { isModelLoading, isWebcamError, liveKeypoints, handType } = useMediaPipeHandDetector(
        webcamContainerRef, 
        videoRef,
        () => {} 
    );

    // *** DYNAMICALLY CHOOSE TARGET LABELS BASED ON DETECTED HAND ***
    const baseLabel = handType ? handType.toUpperCase() : 'RIGHT'; 
    const searchPrefix = `${baseLabel} ${currentLetter} `;
    
    const targetSigns = LOCAL_DATASET.filter(d => 
        d.label.startsWith(searchPrefix)
    );
    
    // --- HINT LOGIC ---
    const wristPosition = liveKeypoints.length > 0 ? liveKeypoints[0] : null;
    const positionalHint = isDetecting && countdown === 0 && wristPosition 
                         ? getPositionalHint(wristPosition) 
                         : '';
    
    const shapeHint = isDetecting && countdown === 0 ? getShapeHint(currentScore) : '';
    const finalHint = positionalHint.includes('Great position') && shapeHint
                    ? shapeHint 
                    : positionalHint; 

    const totalLetters = processedNameLetters.length;
    const progressPercent = ((currentLetterIndex) / totalLetters) * 100;
  
  
    // --- VIDEO RECORDING START/STOP LOGIC ---
    useEffect(() => {
        if (isDetecting && countdown === 0) {
            if (videoRef.current && videoRef.current.captureStream && !mediaRecorderRef.current) {
                try {
                    const canvasElement = webcamContainerRef.current.querySelector('canvas');
                    // Create a stream from the canvas, which includes the drawing
                    const stream = canvasElement ? canvasElement.captureStream() : videoRef.current.captureStream();
                    recordedChunksRef.current = [];

                    // Check for supported mime types for broader compatibility
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
                    console.log("MediaRecorder started...");

                } catch (error) {
                    console.error("Error starting MediaRecorder:", error);
                }
            }
        } else if (!isDetecting && mediaRecorderRef.current) {
            const recorder = mediaRecorderRef.current;
            
            if (recorder.state === 'recording' || recorder.state === 'paused') {
                recorder.stop();
                console.log("MediaRecorder stopped.");

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


    // 1. Countdown and Fail Timer Effect (7s fail timer)
    useEffect(() => {
        if (isDetecting && countdown > 0 && failTimerRef.current) {
             clearTimeout(failTimerRef.current);
             failTimerRef.current = null;
        }
        
        if (!isDetecting || countdown === 0) return;
        
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    
                    if (prev === 1) {
                        failTimerRef.current = setTimeout(() => {
                            if (isDetecting && !isSuccessTransitionRef.current) { 
                                console.log("TIME'S UP! Failed to achieve correct sign.");
                                setIsDetecting(false);
                                setResult(false);
                            }
                        }, MAX_ATTEMPT_TIME); 
                    }
                    return 0; 
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(timer);
            if (failTimerRef.current) clearTimeout(failTimerRef.current);
        };
    }, [isDetecting, countdown]);


    // 2. --- CORE MATCHING LOGIC EFFECT (Multi-Sample Match) ---
    useEffect(() => {
        if (!isDetecting || countdown > 0 || targetSigns.length === 0 || liveKeypoints.length === 0 || !handType) {
            setCurrentDistance(Infinity);
            setCurrentScore(0);
            return;
        }
        
        let minDistance = Infinity;
        let maxScore = 0;
        
        for (const targetSign of targetSigns) {
            const { distance, score } = calculateDistanceAndScore(liveKeypoints, targetSign.keypoints);
            
            if (distance < minDistance) {
                minDistance = distance;
            }
            if (score > maxScore) {
                maxScore = score;
            }
        }

        setCurrentDistance(minDistance);
        setCurrentScore(maxScore);
        
        if (minDistance <= DISTANCE_THRESHOLD) {
            isSuccessTransitionRef.current = true;
            
            if (failTimerRef.current) {
                clearTimeout(failTimerRef.current);
                failTimerRef.current = null;
            }
            
            setIsDetecting(false); 
            setResult(true); 
            
            const clearSuccessFlagTimer = setTimeout(() => {
                isSuccessTransitionRef.current = false;
            }, 1500);

            return () => clearTimeout(clearSuccessFlagTimer);
        }
    
    }, [liveKeypoints, isDetecting, countdown, targetSigns, handType]);


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
            setCurrentDistance(Infinity); 
            setCurrentScore(0); 
            
            setIsDetecting(true);
            setCountdown(3); 
            return; 
        }

        // 2. Handle START/TRY AGAIN click (result is null or false)
        if (isModelLoading || isDetecting || isWebcamError) return;

        if (targetSigns.length === 0) {
            alert(`Error: No dataset entries found for '${baseLabel} ${currentLetter}' in dataset.json. Please record at least one version!`);
            return;
        }

        if (result !== null) setResult(null); 
        if (failTimerRef.current) {
            clearTimeout(failTimerRef.current);
            failTimerRef.current = null;
        }
        
        setIsDetecting(true); 
        setCountdown(3);
    };


    const getButtonText = () => {
        const signsFound = targetSigns.length;
        if (isWebcamError) {
            return <><FiVideoOff className='mr-2' /> CAMERA BLOCKED! Enable & Refresh</>;
        }
        if (isModelLoading) {
            return <><FiZap className='mr-2 animate-spin' /> Loading Hand Tracker...</>;
        }
        if (isDetecting) {
            if (countdown > 0) {
                 return `GET READY! (${countdown})`;
            }
            if (signsFound === 0) {
                return `ERROR: Data for ${baseLabel} ${currentLetter} NOT FOUND!`;
            }
            return `SIGN ${currentLetter} NOW! ANALYZING ${signsFound} VARIANTS...`;
        } else if (result === true) {
            if (currentLetterIndex === processedNameLetters.length - 1) {
                return <><FiCheckCircle className='mr-2' /> DONE! See Final Results</>;
            }
            return <><FiCheckCircle className='mr-2' /> PERFECT! Next Letter!</>;
        } else if (result === false) {
            return <><FiRefreshCcw className='mr-2' /> Try That Again, Partner!</>;
        } 
        return <><FiZap className='mr-2' /> Start BOLO Check</>;
    };

    const getHeaderColor = (r) => {
        if (r === true) return 'bg-teal-600';
        if (r === false) return 'bg-pink-600';
        return 'bg-gray-800';
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 flex flex-col overflow-hidden relative border-8 border-gray-800">
            <Navbar />
            
            {/* Animated Decor Elements (FIXED: Added unique keys) */}
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
                                    <li>Match the shape EXACTLY!</li>
                                    <li>Target: <span className="font-bold text-pink-500">{baseLabel} {currentLetter} (Matching against {targetSigns.length} variants)</span></li>
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
                                // Video element now visible (but visually covered by canvas) for MediaRecorder to capture it.
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
                                {isModelLoading && !isWebcamError && (
                                    <motion.div
                                        key="loading"
                                        className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <div className="text-center">
                                            <div className="text-6xl mb-4 text-white animate-pulse">📡</div>
                                            <p className="text-white text-xl font-bold">Loading Hand Tracker...</p>
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
                                {(!isModelLoading && !isWebcamError) && (isDetecting || result !== null) && (
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
                                                    MATCHING... {currentScore}%
                                                </p>
                                            )}
                                            {result === true && (
                                                <p className="text-3xl font-black text-teal-400">
                                                    <FiCheckCircle className='inline mr-2' /> PERFECT!
                                                </p>
                                            )}
                                            {result === false && (
                                                <p className="text-3xl font-black text-pink-400">
                                                    <FiXCircle className='inline mr-2' /> TRY AGAIN!
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Real-time score and hint display */}
                            {isDetecting && countdown === 0 && !isModelLoading && !isWebcamError && (
                                <div className={`absolute bottom-0 inset-x-0 p-3 z-30 bg-gray-800/90 border-t-4 ${currentDistance <= DISTANCE_THRESHOLD ? 'border-teal-400' : 'border-pink-400'}`}>
                                    <div className="flex justify-between items-center text-white font-bold">
                                        <span>SCORE: </span>
                                        <motion.span 
                                            key={currentScore}
                                            className={`text-2xl ${currentScore >= 90 ? 'text-teal-400' : currentScore >= 70 ? 'text-yellow-400' : 'text-pink-400'}`}
                                            initial={{ scale: 0.8, opacity: 0.5 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                        >
                                            {currentScore}%
                                        </motion.span>
                                    </div>
                                    {finalHint && (
                                        <p className={`mt-2 text-sm font-medium ${currentScore >= 90 ? 'text-teal-300' : 'text-yellow-300'}`}>
                                            👉 {finalHint}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6">
                            <AnimatedButton
                                onClick={handleDetectionAction}
                                disabled={isDetecting || isModelLoading || isWebcamError || (liveKeypoints.length === 0 && result === false)}
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
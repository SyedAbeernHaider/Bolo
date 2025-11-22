import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowRight, FiZap, FiVolumeX, FiRefreshCcw, FiCheckCircle, FiXCircle, FiVideoOff } from 'react-icons/fi';

// --- Firebase Storage Imports ---
import { storage } from '../firebase'; // Assuming firebase.js is in the parent directory
import { ref, getDownloadURL } from 'firebase/storage';

// --- MediaPipe Imports ---
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- VectorStore Import ---
import { SignVectorStore } from './VectorStore';
import Navbar from './Navbar';

// --- MediaPipe Constants (Must match Dataset.jsx for fixed vector length) ---
const VIDEO_WIDTH = 800;
const VIDEO_HEIGHT = 600;

// Sequence Constants (UPDATED to match new Dataset.jsx logic)
const TARGET_FRAME_COUNT = 7; // Fixed length of the sequence
const SAMPLE_RATE = 10; // <--- ONLY EVERY 10TH FRAME IS USED (Base rate for sampling check)
const VECTOR_LENGTH = TARGET_FRAME_COUNT * 21 * 3; // = 441
const ZERO_KEYPOINT = { x: 0, y: 0, z: 0 };


// --- DETECTION THRESHOLDS (Using Cosine Similarity) ---
const SIMILARITY_THRESHOLD = 0.70; // Cosine Similarity threshold (0.70 = 70%)
// AUTO-ADVANCE CONSTANT
const AUTO_ADVANCE_DELAY = 1500; // 1.5 seconds delay for visual feedback


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
    return 'Hold the sign steady while the sequence is being recorded (~2-3 seconds).';
};

const getShapeHint = (score) => {
    if (score < 70) return 'The sequence match is low. Try holding the sign more consistently.';
    if (score < 95) return 'Almost there! Consistent movement is key.';
    return 'Perfect sequence consistency!';
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


// --- HELPER COMPONENTS ---

const AnimatedButton = ({ onClick, children, className = "", type = 'button', disabled = false, result = null }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-xl transition-all duration-300 transform border-4 border-gray-800";

    // Check if result is a boolean (true or false)
    const isSuccess = result === true;
    const isFailure = result === false;

    if (disabled && !isSuccess) {
        // Updated style for disabled button: less contrast for cool-down timer
        baseStyle += " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed opacity-70";
    } else if (isSuccess) {
        // Only final sign uses the success style and is clickable for navigation
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
// --- End Helper Components ---


// --- Main Detection Component ---
const Detection = () => {
    const location = useLocation();

    // Name: ABEER => processedNameLetters: ['A', 'B', 'E', 'E', 'R']
    const { userName = 'USER', nameLetters = ['A'] } = location.state || {};
    const processedNameLetters = userName.toUpperCase().split('');

    const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
    const currentLetter = processedNameLetters[currentLetterIndex] ? processedNameLetters[currentLetterIndex].toUpperCase() : 'A';

    const [isDetecting, setIsDetecting] = useState(false);
    const [result, setResult] = useState(null); // null | true | false
    const [countdown, setCountdown] = useState(3);
    const [currentScore, setCurrentScore] = useState(0); // Sequence Similarity Score (0-100)
    const [isVectorStoreLoading, setIsVectorStoreLoading] = useState(true);

    // NEW STATE: Tracks the specific reason for a 'false' result (Wrong Sign or No Match)
    const [failureMessage, setFailureMessage] = useState(null); // null | 'WRONG_SIGN:X' | 'NO_MATCH' 

    // *** NEW STATE FOR COOL-DOWN TIMER ***
    const [coolDownTimer, setCoolDownTimer] = useState(0); // 0 means no cool-down, >0 means active timer

    const [recordedSigns, setRecordedSigns] = useState([]);

    // --- NEW STATES FOR FIREBASE STORAGE VIDEO ---
    const [currentVideoUrl, setCurrentVideoUrl] = useState(null);
    const [isVideoLoading, setIsVideoLoading] = useState(true);

    // ----------------------------------------------------------------------
    // *** NEW: CACHE FOR STORING VIDEO BLOB URLS (memory-based caching) ***
    // ----------------------------------------------------------------------
    const videoCacheRef = useRef({});
    // State to track if all initial videos have been fetched
    const [isAllVideosLoaded, setIsAllVideosLoaded] = useState(false);

    // NEW REF: Flag to ensure fetch runs only once on mount
    const hasFetchedAllVideos = useRef(false);

    const navigate = useNavigate();

    const webcamContainerRef = useRef(null);
    const videoRef = useRef(null);
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

    // ----------------------------------------------------------------------
    // *** CORE LOGIC: FETCH ALL UNIQUE VIDEOS ONCE INTO CACHE (Browser Memory) ***
    // *** CORRECTED: File extension changed from .mp4 to .webm ***
    // ----------------------------------------------------------------------
    useEffect(() => {
        // Prevent running more than once on mount
        if (hasFetchedAllVideos.current) {
            return;
        }
        // Set the flag immediately after the first check
        hasFetchedAllVideos.current = true;

        // 1. Get a unique list of all letters in the user's name
        const uniqueLetters = [...new Set(processedNameLetters)]
            .filter(letter => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.includes(letter));

        // In this single-run useEffect, all unique letters are the ones to fetch
        const lettersToFetch = uniqueLetters;

        if (lettersToFetch.length === 0) {
            setIsAllVideosLoaded(true);
            return;
        }

        const fetchAllVideos = async () => {
            const fetchPromises = lettersToFetch.map(async (letter) => {
                try {
                    // *** CRITICAL CHANGE: UPDATED TO .webm ***
                    const videoRef = ref(storage, `sign_alphabets/${letter}.webm`);
                    const url = await getDownloadURL(videoRef);

                    // 2. Fetch the video data itself (using { mode: 'cors' } is essential)
                    const response = await fetch(url, { mode: 'cors' });
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    // 3. Convert data to a Blob and create a Blob URL (memory cache)
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);

                    // 4. Store the Blob URL in the cache
                    videoCacheRef.current[letter] = blobUrl;
                    console.log(`Video for ${letter} cached: ${blobUrl.substring(0, 30)}...`);

                } catch (error) {
                    // Log an error and mark the letter as unavailable
                    console.error(`Failed to fetch or cache video for ${letter}:`, error);
                    videoCacheRef.current[letter] = null; // Store null to prevent attempting playback
                }
            });

            await Promise.all(fetchPromises);
            setIsAllVideosLoaded(true);
        };

        // Start fetching videos
        fetchAllVideos();

        // Cleanup: Revoke Blob URLs when the component unmounts
        return () => {
            Object.values(videoCacheRef.current).forEach(url => {
                if (url && url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
        // Empty dependency array ensures this runs exactly once on mount
    }, [processedNameLetters]);


    // ----------------------------------------------------------------------
    // *** VIDEO DISPLAY LOGIC: PULL FROM CACHE RATHER THAN FETCHING ***
    // ----------------------------------------------------------------------
    useEffect(() => {
        if (!currentLetter || !isAllVideosLoaded) {
            setCurrentVideoUrl(null);
            setIsVideoLoading(true);
            return;
        }

        // 1. Check the in-memory cache
        const cachedUrl = videoCacheRef.current[currentLetter];

        if (cachedUrl) {
            // Instant load from cache
            setCurrentVideoUrl(cachedUrl);
            setIsVideoLoading(false);
        } else if (cachedUrl === null) {
            // Video was not found during initial fetch
            setCurrentVideoUrl(null);
            setIsVideoLoading(false);
        } else {
            // Videos are still loading 
            setIsVideoLoading(true);
        }

    }, [currentLetter, isAllVideosLoaded]); // Runs when the letter changes OR all initial videos complete loading

    // *** NEW EFFECT: COOL-DOWN TIMER LOGIC (5 seconds) ***
    useEffect(() => {
        // Start the cool-down timer only when a detection fails
        if (result === false) {
            setCoolDownTimer(5); // Start the 5-second cool-down

            const coolDownInterval = setInterval(() => {
                setCoolDownTimer(prev => {
                    if (prev <= 1) {
                        clearInterval(coolDownInterval);
                        return 0; // Stop and reset the timer
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(coolDownInterval);
        }

        // If detection is successful or result is null/detecting, ensure the timer is cleared
        if (result !== false) {
            setCoolDownTimer(0);
        }
    }, [result]);

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

    // --- VIDEO RECORDING START/STOP LOGIC ---
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


    // 1. Countdown Effect
    useEffect(() => {

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
        };
    }, [isDetecting, countdown]);

    // *** Auto-Advance Effect ***
    useEffect(() => {
        // Only run if successful AND not the last letter
        if (result === true && currentLetterIndex < processedNameLetters.length - 1) {

            const autoAdvanceTimer = setTimeout(() => {
                // Auto-advance logic
                setCurrentLetterIndex(prev => prev + 1);
                setResult(null);
                setCurrentScore(0);
                setFailureMessage(null);
                setCoolDownTimer(0); // Clear cool-down on success
                setIsDetecting(true);
                setCountdown(3);
            }, AUTO_ADVANCE_DELAY); // 1.5 seconds delay

            return () => clearTimeout(autoAdvanceTimer);
        }
    }, [result, currentLetterIndex, processedNameLetters.length]);


    // 2. --- CORE SEQUENCE SAMPLING & SINGLE MATCH LOGIC EFFECT (FAST DETECTION) ---
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
                            setCoolDownTimer(0); // Ensure cool-down is off

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

                // CRUCIAL: If a successful match was NOT achieved, stop detecting immediately for fast feedback.
                if (!isSuccessfulMatch) {
                    setIsDetecting(false);
                    setResult(false);
                    // The cool-down timer will start via the useEffect hook now.
                }
            }
        }

    }, [liveKeypoints, isDetecting, countdown, handType, incomingFrameCounter, isModelLoading, isWebcamError, isVectorStoreLoading, currentLetter]);


    // Main Detection Action (Handles Start, Try Again, and Final Result clicks)
    const handleDetectionAction = () => {
        // 1. Handle FINAL SUCCESS button click (Only clickable on the last letter when result is true)
        if (result === true && currentLetterIndex === processedNameLetters.length - 1) {
            navigate('/result', { state: { recordedSigns: recordedSigns, userName: userName, totalSignsAttempted: processedNameLetters.length } });
            return;
        }

        // 2. Prevent clicks if successfully waiting for auto-advance or during cool-down
        if (result === true && currentLetterIndex < processedNameLetters.length - 1) {
            // Do nothing, let the auto-advance useEffect handle the transition
            return;
        }

        // Prevent clicks if cool-down is active
        if (coolDownTimer > 0) {
            return;
        }


        // 3. Handle START/TRY AGAIN click (result is null or false)
        if (isModelLoading || isDetecting || isWebcamError || isVectorStoreLoading || !isAllVideosLoaded) return;

        // --- NEW CHECK: Wait for videos to load ---
        if (!isAllVideosLoaded) {
            // This alert shouldn't be reached if the button is disabled, but serves as a backup.
            alert('Please wait for all tutorial videos to finish loading.');
            return;
        }


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
            return <><FiZap className='mr-2 animate-spin' /> Loading Sign Recognition AI Agent...</>;
        }
        if (!isAllVideosLoaded) {
            return <><FiZap className='mr-2 animate-spin' /> Loading All Tutorial Videos...</>;
        }

        // *** NEW: Cool-down active check (highest priority failure state) ***
        if (coolDownTimer > 0) {
            return <><FiRefreshCcw className='mr-2' /> TRY AGAIN IN {coolDownTimer}</>;
        }

        if (isDetecting) {
            if (countdown > 0) {
                return `GET READY! (${countdown})`;
            }
            if (targetVariantsCount === 0) {
                return `ERROR: Data for ${baseLabel} ${currentLetter} NOT FOUND!`;
            }
            // Message moved to the top banner
            return `SIGN ${currentLetter} NOW! DETECTING...`;
        } else if (result === true) {
            if (currentLetterIndex === processedNameLetters.length - 1) {
                return <><FiCheckCircle className='mr-2' /> DONE! See Final Results</>;
            }
            // New text for auto-advance
            return <><FiCheckCircle className='mr-2' /> PERFECT! Auto-Advancing...</>;
        } else if (result === false) {
            // Differentiate between Wrong Sign and No Match (Only hit if coolDownTimer is 0)
            if (failureMessage && failureMessage.startsWith('WRONG_SIGN')) {
                const wrongLetter = failureMessage.split(':')[1];
                return <><FiXCircle className='mr-2' />  Try Again.</>;
            }
            // Covers NO_MATCH 
            return <><FiRefreshCcw className='mr-2' /> No Match Found! Try Again.</>;
        }
        return <><FiZap className='mr-2' />Start signing!</>;
    };

    const getHeaderColor = (r) => {
        if (r === true) return 'bg-teal-600';
        if (r === false) return 'bg-pink-600';
        return 'bg-gray-800';
    };

    // The button should be disabled if detection is running, or if successful and auto-advancing, OR if coolDownTimer > 0
    const isButtonDisabled = isDetecting || isModelLoading || isWebcamError || isVectorStoreLoading || !isAllVideosLoaded || coolDownTimer > 0 || (result === true && currentLetterIndex < processedNameLetters.length - 1);

    // Calculate progress for the new progress bar
    const currentFramesCollected = sequenceBufferRef.current.length;
    const progressPercentForLoader = Math.round((currentFramesCollected / TARGET_FRAME_COUNT) * 100);


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

                        {/* --- DYNAMIC VIDEO DISPLAY (NOW PULLS FROM CACHE) --- */}
                        <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
                            {(isVideoLoading || !isAllVideosLoaded) && (
                                <div className="text-white text-xl p-4 animate-pulse">Loading All Videos...</div>
                            )}
                            {(!isVideoLoading && isAllVideosLoaded && !currentVideoUrl) && (
                                <div className="text-pink-400 text-xl p-4 text-center">
                                    Video Not Found for {currentLetter}<br />(Check Firebase Storage: sign_alphabets/{currentLetter}.webm)
                                </div>
                            )}
                            {(!isVideoLoading && isAllVideosLoaded && currentVideoUrl) && (
                                <video
                                    key={currentLetter}
                                    src={currentVideoUrl} // This is now a Blob URL from memory
                                    autoPlay
                                    loop
                                    muted
                                    // *** COMMIT: VIDEO ZOOM/CROP STYLE START ***
                                    // We use object-contain and then scale to zoom in, cropping edges but preserving ratio.
                                    className="w-full h-full object-contain bg-black"
                                    style={{ transform: 'scale(1.00)' }} // Adjust the '1.15' value to control zoom (1.0 is no zoom, 1.2 is 20% zoom)
                                    // *** COMMIT: VIDEO ZOOM/CROP STYLE END ***
                                    playsInline
                                    crossOrigin="anonymous"
                                />
                            )}
                        </div>
                        {/* --- END DYNAMIC VIDEO DISPLAY --- */}

                        <div className="p-6">
                            <div className="bg-yellow-100 p-4 rounded-xl border-2 border-gray-800">
                                <p className="text-lg font-black text-gray-800">BOLO TIP:</p>
                                <ul className="text-base text-gray-700 list-disc pl-5 mt-1">
                                    <li>Keep your wrist firm!</li>
                                    <li>Match the sequence consistently over the capture time!</li>
                                    {/* <li>Target: <span className="font-bold text-pink-500">{baseLabel} {currentLetter} (Matching against {targetVariantsCount} variants)</span></li> */}
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
                                // Make the video element technically present but visually hidden
                                style={{
                                    position: 'absolute',
                                    width: VIDEO_WIDTH,
                                    height: VIDEO_HEIGHT,
                                    transform: 'scaleX(-1)',
                                    opacity: 0,
                                    pointerEvents: 'none' // Ensures it can't be clicked
                                }}
                                autoPlay
                                playsInline
                                muted
                                width={VIDEO_WIDTH}
                                height={VIDEO_HEIGHT}
                            />

                            <div
                                ref={webcamContainerRef}
                                className="w-full h-full flex items-center justify-center bg-gray-800 absolute inset-0 z-10"
                            >
                                {/* MediaPipe Canvas is appended here by the hook */}
                            </div>

                            <AnimatePresence>
                                {/* Loading State */}
                                {(isModelLoading || isVectorStoreLoading || !isAllVideosLoaded) && !isWebcamError && (
                                    <motion.div
                                        key="loading"
                                        className="absolute inset-0 flex items-center justify-center bg-gray-900 z-30"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <div className="text-center">
                                            <div className="text-6xl mb-4 text-white animate-pulse">📡</div>
                                            <p className="text-white text-xl font-bold">
                                                {isModelLoading || isVectorStoreLoading ? 'Loading Sign Recognition AI Agent...' : 'Loading Tutorial Videos...'}
                                            </p>
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

                                {/* Feedback Banner (Non-Distracting Progress) */}
                                {(!isModelLoading && !isWebcamError && !isVectorStoreLoading && isAllVideosLoaded) && (isDetecting || result !== null) && (
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
                                            {/* *** UPDATED ANALYZING/HOLD SIGN SECTION WITH PROGRESS BAR *** */}
                                            {isDetecting && countdown === 0 && (
                                                <div className="flex flex-col items-center px-4">
                                                    <p className="text-3xl font-black text-yellow-400 animate-pulse mb-2">
                                                        HOLD SIGN! ANALYZING...
                                                    </p>
                                                    {/* Simple Progress Bar */}
                                                    <div className="w-full h-2 bg-gray-600 rounded-full overflow-hidden border border-gray-500">
                                                        <motion.div
                                                            className="h-full bg-pink-500 rounded-full"
                                                            initial={{ width: '0%' }}
                                                            animate={{ width: `${progressPercentForLoader}%` }}
                                                            transition={{ duration: 0.2, ease: "linear" }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {result === true && (
                                                <p className="text-3xl font-black text-teal-400">
                                                    <FiCheckCircle className='inline mr-2' /> PERFECT!
                                                </p>
                                            )}
                                            {result === false && (
                                                <p className="text-3xl font-black text-pink-400">
                                                    <FiXCircle className='inline mr-2' />
                                                    {coolDownTimer > 0 ? (
                                                        `TRY AGAIN IN ${coolDownTimer}!`
                                                    ) : failureMessage && failureMessage.startsWith('WRONG_SIGN') ?
                                                        `WRONG SIGN!` :
                                                        'WRONG SIGN!'}
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                        </div>

                        <div className="p-6">
                            <AnimatedButton
                                onClick={handleDetectionAction}
                                disabled={isButtonDisabled} // Use the new disabled state
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
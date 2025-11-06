import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiArrowRight, FiZap, FiVolumeX, FiRefreshCcw, FiCheckCircle, FiXCircle, FiVideoOff } from 'react-icons/fi'; // Added FiVideoOff

// Import Teachable Machine Libraries (must be installed via npm: @tensorflow/tfjs and @teachablemachine/image)
import * as tmImage from '@teachablemachine/image';
import * as tf from '@tensorflow/tfjs';

// --- Teachable Machine Constants ---
const MODEL_URL = '/my_model/model.json';
const METADATA_URL = '/my_model/metadata.json';

// --- Helper Components for Animation ---
const Navbar = () => (
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-start items-center z-20 relative">
    <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
        <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
    </div>
  </nav>
);

const AnimatedButton = ({ onClick, children, className = "", type = 'button', disabled = false, result = null }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-xl transition-all duration-300 transform border-4 border-gray-800";
    if (disabled) {
        baseStyle += " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed";
    } else if (result === true) {
        baseStyle += " bg-teal-400 text-gray-800 shadow-[8px_8px_0px_#1f2937] hover:bg-teal-300";
    } else if (result === false) {
        baseStyle += " bg-pink-500 text-white shadow-[8px_8px_0px_#1f2937] hover:bg-pink-400";
    } else {
        baseStyle += " bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[8px_8px_0px_#1f2937]";
    }

    return (
        <motion.button
            type={type}
            onClick={onClick}
            className={`${baseStyle} ${className} flex items-center justify-center relative overflow-hidden`}
            whileHover={!disabled ? { scale: 1.03, boxShadow: "12px 12px 0px #1f2937", y: -2, rotate: 1 } : {}} 
            whileTap={!disabled ? { scale: 0.95, boxShadow: "4px 4px 0px #1f2937", y: 0, rotate: -1 } : {}} 
            disabled={disabled}
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

// --- Video Data (Omitted for brevity) ---
const signVideos = {
    // ... your video data
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


// --- CUSTOM HOOK: useTeachableMachine ---
const useTeachableMachine = (modelURL, metadataURL, webcamRef, isPredictionActive) => {
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [isWebcamError, setIsWebcamError] = useState(false); // New state for camera error
    const [model, setModel] = useState(null);
    const [webcam, setWebcam] = useState(null);
    const [prediction, setPrediction] = useState(null);
    const rafId = useRef(null);

    // 1. Model and Webcam Initialization (runs ONCE on mount)
    useEffect(() => {
        const init = async () => {
            setIsWebcamError(false);
            try {
                // Load model first
                const loadedModel = await tmImage.load(modelURL, metadataURL);
                setModel(loadedModel);
                setIsModelLoading(false);

                // Setup webcam
                const flip = true; 
                // Increased canvas size to better fill the container, although CSS controls final display
                const webcamInstance = new tmImage.Webcam(480, 360, flip); 
                
                await webcamInstance.setup(); 
                await webcamInstance.play();
                setWebcam(webcamInstance);
                
                // Append canvas to the ref container
                if (webcamRef.current) {
                    webcamRef.current.innerHTML = ''; 
                    webcamRef.current.appendChild(webcamInstance.canvas);
                    // Ensure the canvas stretches and covers the area
                    webcamInstance.canvas.style.width = '100%';
                    webcamInstance.canvas.style.height = '100%';
                    webcamInstance.canvas.style.objectFit = 'cover';
                    webcamInstance.canvas.style.borderRadius = '1.5rem'; // rounded-3xl
                }
                
            } catch (error) {
                console.error("Failed to load Teachable Machine model or setup webcam:", error);
                
                // Check specifically for media device errors (camera access)
                if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
                    setIsWebcamError(true);
                } else {
                    setIsModelLoading(false);
                }
            }
        };

        init();

        // 2. Cleanup function (runs on UNMOUNT)
        return () => {
            if (webcam) {
                webcam.stop();
            }
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
            }
            if (model) {
                model.dispose();
            }
            if (webcamRef.current) {
                 webcamRef.current.innerHTML = '';
            }
            tf.disposeVariables(); 
        };
    }, [webcamRef, modelURL, metadataURL]);


    // 3. Prediction Function
    const predict = useCallback(async () => {
        if (!model || !webcam || !webcam.canvas) return;

        webcam.update(); 
        
        const rawPrediction = await model.predict(webcam.canvas);
        const topPrediction = rawPrediction.sort((a, b) => b.probability - a.probability)[0];
        
        setPrediction(topPrediction); 
        
        if (isPredictionActive) {
            rafId.current = window.requestAnimationFrame(predict);
        }

    }, [model, webcam, isPredictionActive]);
    
    // 4. Control Prediction Loop 
    useEffect(() => {
        if (isPredictionActive) {
            rafId.current = window.requestAnimationFrame(predict);
        } else {
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }
        }
        return () => {
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
            }
        };
    }, [isPredictionActive, predict]);


    return { isModelLoading, isWebcamError, prediction, model, webcam };
};

// --- Main Detection Component ---
const Detection = () => {
  const location = useLocation();
  const { userName = 'USER', nameLetters = ['A', 'B', 'C'] } = location.state || {};
  
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const currentLetter = nameLetters[currentLetterIndex] || 'A';
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState(null); // null, true, or false
  const [countdown, setCountdown] = useState(3);
  const navigate = useNavigate();
  
  const webcamContainerRef = useRef(null);

  const { isModelLoading, isWebcamError, prediction } = useTeachableMachine(
    MODEL_URL, 
    METADATA_URL, 
    webcamContainerRef, 
    isDetecting 
  );

  const totalLetters = nameLetters.length;
  const progressPercent = ((currentLetterIndex) / totalLetters) * 100;

  // Countdown effect
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

    return () => clearInterval(timer);
  }, [isDetecting, countdown]);


  // Main Detection Logic
  const handleStartDetection = () => {
    if (isModelLoading || isDetecting || isWebcamError) return;

    setResult(null);
    setIsDetecting(true); 
    setCountdown(3);
    
    const countdownDelay = 3000;
    const detectionTime = 2500; 

    const predictionTimeout = setTimeout(() => {
      setIsDetecting(false); 
      
      let isCorrect = false;
      if (prediction && prediction.className.toUpperCase() === currentLetter && prediction.probability > 0.8) {
        isCorrect = true;
      } else {
         console.log(`Failed! Best guess was ${prediction?.className} (${(prediction?.probability * 100).toFixed(1)}%)`);
      }
      
      setResult(isCorrect);
      
      if (isCorrect) {
        setTimeout(() => {
          if (currentLetterIndex < nameLetters.length - 1) {
            setCurrentLetterIndex(prev => prev + 1);
            setResult(null); 
          } else {
            navigate('/result'); 
          }
        }, 1500); 
      }

    }, countdownDelay + detectionTime);
    
    return () => clearTimeout(predictionTimeout);
  };

  const getButtonText = () => {
    if (isWebcamError) {
        return <><FiVideoOff className='mr-2' /> CAMERA BLOCKED! Enable & Refresh</>;
    }
    if (isModelLoading) {
        return <><FiZap className='mr-2 animate-spin' /> Loading Model...</>;
    }
    if (isDetecting) {
        if (countdown > 0) {
             return `GET READY! (${countdown})`;
        }
        return `SIGN NOW! ANALYZING...`;
    } else if (result === true) {
        return <><FiCheckCircle className='mr-2' /> BOOM! Next Letter!</>;
    } else if (result === false) {
        return <><FiRefreshCcw className='mr-2' /> Try That Again, Partner!</>;
    } else if (currentLetterIndex >= nameLetters.length - 1) {
        return <><FiArrowRight className='mr-2' /> See Final Results</>;
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
      
      {/* Animated Decor Elements */}
      <WiggleStar size="5xl" position="top-10 left-10" />
      <WiggleStar size="4xl" position="bottom-10 right-10" />

      <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full relative z-10">
        
        {/* Progress Bar (Arcade-Style) */}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
          {/* Left Side - Video Tutorial */}
          <motion.div 
            className="bg-white rounded-3xl shadow-xl border-4 border-gray-800 overflow-hidden"
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
                  <li>Don't forget the thumb!</li>
                </ul>
              </div>
            </div>
          </motion.div>
          
          {/* Right Side - Webcam / Detection Panel (LIVE CAMERA FEED) */}
          <motion.div 
            className="bg-white rounded-3xl shadow-xl border-4 border-gray-800 flex flex-col overflow-hidden"
            initial={{ x: 100, rotate: 5, opacity: 0 }}
            animate={{ x: 0, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 100, delay: 0.1 }}
            whileHover={{ scale: 1.02, boxShadow: "15px 15px 0px #1f2937" }}
          >
            <div className={`${getHeaderColor(result)} p-4 border-b-4 border-gray-800`}>
              <h2 className="text-2xl font-black text-white filter drop-shadow">YOUR TURN: Sign {currentLetter}</h2>
            </div>
            
            {/* Webcam Container: Webcam is ON and VISIBLE here */}
            <div className="flex-1 bg-gray-900 flex items-center justify-center relative aspect-video overflow-hidden">
                <div 
                    ref={webcamContainerRef} 
                    className="w-full h-full flex items-center justify-center bg-gray-800"
                >
                    {/* Webcam canvas is appended here by the hook */}
                    {(isModelLoading || isWebcamError) && (
                        <div className="text-center p-8 absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10">
                            {isWebcamError ? (
                                <>
                                    <FiVideoOff className="text-6xl mb-4 text-pink-500" />
                                    <p className="text-pink-400 text-xl font-bold">CAMERA ACCESS BLOCKED</p>
                                    <p className="text-gray-300 text-sm mt-2">Please enable camera permissions in your browser settings and refresh the page.</p>
                                </>
                            ) : (
                                <>
                                    <div className="text-6xl mb-4 text-white animate-pulse">📡</div>
                                    <p className="text-white text-xl font-bold">Loading BOLO AI Model...</p>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Initial Prompt Overlay (Semi-transparent over the camera feed) */}
                <AnimatePresence>
                    {!isModelLoading && !isWebcamError && !isDetecting && result === null && (
                        <motion.div 
                            key="prompt"
                            className="absolute inset-0 flex flex-col justify-end items-center p-8 z-10 pointer-events-none"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            {/* Gradient for contrast with the camera feed */}
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent"></div>
                            
                            <div className="text-center relative pointer-events-auto">
                                <div className="text-6xl mb-2 text-white">✋</div>
                                <p className="text-white text-xl font-bold">Get Ready! Sign Letter:</p>
                                <motion.div 
                                    className="text-7xl font-black text-yellow-400 my-2"
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                    {currentLetter}
                                </motion.div>
                                <p className="text-gray-300 text-sm">Position your hand in the view above.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
              
              {/* Prediction Debug/Feedback (Optional) */}
              {prediction && !isDetecting && !isModelLoading && (
                  <div className="absolute top-2 left-2 p-2 bg-black/50 text-xs text-white rounded z-30">
                      Best Guess: {prediction.className}: {(prediction.probability * 100).toFixed(1)}%
                  </div>
              )}
              
              {/* Detection overlay - Countdown and Analysis */}
              <AnimatePresence>
                {isDetecting && (
                  <motion.div 
                    key="detecting"
                    className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div 
                      className="text-center text-white"
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                    >
                      {countdown > 0 ? (
                          <>
                            <motion.div 
                                className="text-9xl font-black text-yellow-400 mb-4"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                {countdown}
                            </motion.div>
                            <p className="text-2xl font-bold">GET READY TO BOLO!</p>
                          </>
                      ) : (
                          <>
                            <div className="text-9xl font-black text-pink-400 mb-4">⚡</div>
                            <p className="text-2xl font-bold animate-pulse">SIGNING! ANALYZING...</p>
                          </>
                      )}
                      
                    </motion.div>
                  </motion.div>
                )}
                
                {/* Result Overlay */}
                {result !== null && (
                  <motion.div 
                    key="result"
                    className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.5 } }}
                  >
                    <motion.div 
                      className={`text-[120px] font-black ${result ? 'text-teal-400' : 'text-pink-400'}`}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ 
                        scale: [0, 1.2, 1],
                        rotate: [0, 10, -10, 0],
                        y: [0, -20, 0]
                      }}
                      transition={{ 
                        duration: 0.8,
                        ease: [0.68, -0.55, 0.27, 1.55] 
                      }}
                    >
                      {result ? '💥' : '❌'}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="p-6">
              <AnimatedButton
                onClick={handleStartDetection}
                disabled={isDetecting || isModelLoading || isWebcamError || (result === true && currentLetterIndex < nameLetters.length - 1)}
                result={result}
                className="w-full py-4 text-2xl font-black"
              >
                {getButtonText()}
              </AnimatedButton>
              
              <motion.div 
                className="mt-4 flex items-center justify-between text-base text-gray-800 font-bold"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span>Practicing: {userName}</span>
                <span>Letter: {currentLetter} ({currentLetterIndex + 1}/{nameLetters.length})</span>
              </motion.div>
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
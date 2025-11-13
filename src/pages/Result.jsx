import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react'; 
import { useNavigate, useLocation } from 'react-router-dom'; 
import { FiArrowLeftCircle, FiArrowRightCircle, FiVolumeX, FiRefreshCcw, FiHome, FiShare2, FiPlay, FiPause, FiSkipBack, FiSkipForward, FiMail, FiSend, FiUser } from 'react-icons/fi';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';

// --- Helper Components for Animation and UI ---

// Navbar: Minimal and energetic
const Navbar = () => (
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-start items-center z-40 relative">
    <div className="text-3xl font-black tracking-wider text-white filter drop-shadow-lg">
        <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
    </div>
  </nav>
);

// AnimatedButton: Designed to feel 'bouncy' and high-contrast
const AnimatedButton = ({ onClick, children, className = "", variant = 'default', disabled = false }) => {
    let baseStyle = "px-4 py-2 rounded-xl font-extrabold text-lg transition-all duration-300 transform border-4 border-gray-800";
    
    if (disabled) {
        baseStyle += " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed";
    } else if (variant === 'primary') {
        baseStyle += " bg-teal-400 text-gray-800 hover:bg-teal-300 shadow-[6px_6px_0px_#1f2937]"; // SHRUNK SHADOW
    } else if (variant === 'secondary') {
        baseStyle += " bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[6px_6px_0px_#1f2937]"; // SHRUNK SHADOW
    } else {
        baseStyle += " bg-white text-gray-800 hover:bg-gray-100 shadow-[6px_6px_0px_#1f2937]"; // SHRUNK SHADOW
    }

    return (
        <motion.button
            onClick={onClick}
            className={`${baseStyle} ${className} flex items-center justify-center relative overflow-hidden`}
            whileHover={!disabled ? { scale: 1.03, boxShadow: "8px 8px 0px #1f2937", y: -2, rotate: 0.5 } : {}} // SHRUNK HOVER
            whileTap={!disabled ? { scale: 0.95, boxShadow: "4px 4px 0px #1f2937", y: 0, rotate: -0.5 } : {}} // SHRUNK TAP
            disabled={disabled}
        >
            {children}
        </motion.button>
    );
};

// Component for a constantly wiggling star
const WiggleStar = ({ size, position }) => (
    <motion.div
        className={`absolute text-${size} ${position} filter drop-shadow opacity-70 z-30`}
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
        🌟
    </motion.div>
);

// Floating Hand Emojis that celebrate
const FloatingEmoji = ({ id, x, y, size, duration, delay, emoji }) => (
    <motion.div
        key={id}
        className="absolute text-4xl z-10"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          fontSize: `${size}px`,
          opacity: 0.8
        }}
        animate={{
          y: [0, -1000], // Move vertically off-screen
          x: [x, x + (Math.random() * 20 - 10)], // Subtle side drift
          rotate: [0, 360],
          opacity: [0.8, 0]
        }}
        transition={{
          duration: duration,
          delay: delay,
          repeat: Infinity,
          ease: "linear"
        }}
    >
        {emoji}
    </motion.div>
);


// --- Main Result Component ---

const Result = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const { width, height } = useWindowSize();

  // Retrieve recorded signs and user info
  const { recordedSigns = [], userName = 'Signer', totalSignsAttempted = 0 } = location.state || {};
  
  const [showConfetti, setShowConfetti] = useState(true);
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState(null); // 'sending', 'sent', 'error'
  const videoRef = useRef(null);
  
  // New States for Carousel Replay
  const [currentReplayIndex, setCurrentReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const currentSign = recordedSigns.length > 0 ? recordedSigns[currentReplayIndex] : null;
  const totalSignsMastered = recordedSigns.length;

  // --- RESOURCE CLEANUP ---
  useEffect(() => {
    // When the component unmounts (user navigates away), revoke ALL Blob URLs
    return () => {
        recordedSigns.forEach(sign => {
            if (sign.videoUrl) {
                URL.revokeObjectURL(sign.videoUrl);
                // console.log(`Revoked Blob URL for ${sign.letter}`); // Keep this commented for clean console
            }
        });
    };
  }, [recordedSigns]); 


  // --- AUTO-ADVANCE LOGIC ---
  const handleNextReplay = useCallback(() => {
    if (!isPlaying || totalSignsMastered === 0) return;

    const nextIndex = (currentReplayIndex + 1) % totalSignsMastered;
    setCurrentReplayIndex(nextIndex);
    
    if (videoRef.current) {
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.play().catch(e => {
                    // console.error("Video Playback Error on Auto-Advance:", e);
                    setIsPlaying(false);
                });
            }
        }, 50); 
    }
  }, [currentReplayIndex, totalSignsMastered, isPlaying]);
  
  const handleTogglePlay = () => {
      setIsPlaying(prev => !prev);
      if (videoRef.current) {
          if (isPlaying) {
              videoRef.current.pause();
          } else {
              videoRef.current.play().catch(e => console.error("Playback failed on manual play:", e));
          }
      }
  };


  // Setup initial play state and video event listener
  useEffect(() => {
    if (totalSignsMastered > 0) {
        const videoElement = videoRef.current;
        if (videoElement) {
            videoElement.onended = handleNextReplay;
            
            if (isPlaying) {
                 videoElement.play().catch(e => {
                     // console.error("Initial/Replay video playback failed:", e)
                     setIsPlaying(false);
                 });
            }

            return () => {
                if (videoElement) {
                    videoElement.onended = null;
                }
            };
        }
    }
  }, [totalSignsMastered, isPlaying, handleNextReplay, currentReplayIndex]); 


  // --- STATS CALCULATION & LIFECYCLE ---
  const totalScore = recordedSigns.reduce((sum, sign) => sum + sign.score, 0);
  const averageScore = totalSignsMastered > 0 ? Math.round(totalScore / totalSignsMastered) : 0;
  const masteryRatio = `${totalSignsMastered}/${totalSignsAttempted}`;

  const statItems = [
    { label: 'Avg. Score', value: `${averageScore}%`, icon: '🏆' },
    { label: 'Signs Mastered', value: masteryRatio, icon: '🤟' },
    { label: 'Signs Attempted', value: totalSignsAttempted, icon: '🎯' },
    { label: 'Accuracy Rating', value: averageScore >= 90 ? 'Excellent' : averageScore >= 70 ? 'Good' : 'Fair', icon: '✨' }
  ];
  
  // Hide confetti after 8 seconds
  useEffect(() => {
    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 8000);
    return () => clearTimeout(confettiTimer);
  }, []);
  
  // Email Submission Logic (SIMULATED)
  const isValidEmail = (email) => /\S+@\S+\.\S+/.test(email);

  const handleSubmitEmail = () => {
      if (!isValidEmail(email)) {
          alert("Please enter a valid email address.");
          return;
      }
      
      setEmailStatus('sending');
      
      // Simulate API delay
      setTimeout(() => {
          setEmailStatus('sent');
          // Clear status after a short display
          setTimeout(() => setEmailStatus(null), 3000);
      }, 2000);
  };
  
  // Animated Emojis (unchanged)
  const fireworkElements = Array(20).fill(0).map((_, i) => ({
      id: i,
      emoji: ['🎆', '🎇', '✨', '🎊', '🎉', '🎈', '💫', '🌟', '💥'][Math.floor(Math.random() * 9)],
      size: Math.random() * 40 + 20,
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: Math.random() * 2 + 1,
      delay: Math.random() * 2,
    }));
  const floatingEmojis = Array(15).fill(0).map((_, i) => ({
    id: i,
    emoji: ['🎉', '🏆', '👏', '💯', '✨', '🎊', '🌟', '💫'][Math.floor(Math.random() * 8)],
    size: Math.random() * 20 + 30,
    x: Math.random() * 100,
    y: 100 + Math.random() * 20,
    duration: Math.random() * 10 + 10,
    delay: Math.random() * 5
  }));


  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 flex flex-col overflow-hidden relative border-8 border-gray-800">
      
      {/* Confetti & Fireworks */}
      <AnimatePresence>
        {showConfetti && (
          <Confetti 
            width={width} 
            height={height} 
            recycle={false}
            numberOfPieces={600}
            gravity={0.3}
            colors={['#f43f5e', '#ec4899', '#fde047', '#2dd4bf', '#1f2937']} 
            confettiSource={{ x: 0, y: height, w: width, h: 1 }}
            className='z-50'
          />
        )}
      </AnimatePresence>
      <div className="fixed inset-0 pointer-events-none z-40">
        {fireworkElements.map((fw) => (
          <motion.div
            key={fw.id}
            className="absolute"
            style={{ left: `${fw.x}%`, top: `${fw.y}%`, fontSize: `${fw.size}px`, transform: 'translate(-50%, -50%)'}}
            animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0], rotate: [0, 180, 360] }}
            transition={{ duration: fw.duration, delay: fw.delay, ease: 'easeOut', times: [0, 0.5, 1], repeat: 3, repeatDelay: 2 }}
          >
            {fw.emoji}
          </motion.div>
        ))}
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingEmojis.map(props => <FloatingEmoji key={props.id} {...props} />)}
      </div>

      <WiggleStar size="3xl" position="top-10 right-1/4" /> {/* SHRUNK */}
      <WiggleStar size="2xl" position="bottom-10 left-10" /> {/* SHRUNK */}

      <Navbar />
      
      <div className="flex-1 flex flex-col items-center p-4 relative z-30 overflow-y-auto"> {/* SHRUNK PADDING */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
          animate={{ scale: 1, opacity: 1, y: 0, rotate: [0, 0.2, -0.2, 0.2, 0] }} // SHRUNK ROTATION/SCALE
          transition={{ type: 'spring', stiffness: 150, damping: 10, duration: 0.8, rotate: { repeat: Infinity, duration: 8, ease: "linear" } }}
          className="w-full max-w-4xl bg-white/95 backdrop-blur-sm rounded-2xl border-4 border-gray-800 shadow-[10px_10px_0px_#1f2937] p-6 md:p-8 relative overflow-hidden my-auto" // SHRUNK SIZE
        >
          
          <div className="relative z-10">
            <div className="text-center mb-8">
              <motion.h1 
                className="text-3xl md:text-5xl font-black text-gray-800 mb-2" // SHRUNK TEXT
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                CONGRATULATIONS!
              </motion.h1>
              
              <motion.p 
                className="text-xl md:text-3xl text-pink-600 font-black mb-4" // SHRUNK TEXT
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                You have successfully signed your name: <span className='text-teal-600 underline'>{userName.toUpperCase()}</span>!
              </motion.p>
            </div>
            
            {/* Stats Grid - High Contrast */}
            <motion.div 
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" // SHRUNK GAP/MARGIN
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              {statItems.map((stat, index) => (
                <motion.div 
                  key={stat.label}
                  className="bg-yellow-100 p-3 rounded-xl border-2 border-gray-800 shadow-[2px_2px_0px_#1f2937] text-center" // SHRUNK SIZE
                  initial={{ opacity: 0, y: 20, rotate: -2 }} // SHRUNK ANIMATION
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: 0.6 + (index * 0.1), duration: 0.4 }}
                >
                  <div className="text-2xl mb-1">{stat.icon}</div> {/* SHRUNK TEXT */}
                  <div className="text-xl font-black text-teal-600">{stat.value}</div> {/* SHRUNK TEXT */}
                  <div className="text-xs text-gray-800 font-semibold">{stat.label}</div> {/* SHRUNK TEXT */}
                </motion.div>
              ))}
            </motion.div>

            {/* Video Replay Section (Carousel Style) */}
            <h2 className="text-2xl font-black text-gray-800 border-b-2 border-pink-500 pb-1 mb-4 text-center">Your Signed Alphabet Replay ({currentReplayIndex + 1}/{totalSignsMastered})</h2> {/* SHRUNK TEXT */}
            
            {totalSignsMastered > 0 && currentSign ? (
                <motion.div 
                    key={currentReplayIndex}
                    className="aspect-video w-full max-w-3xl mx-auto bg-gray-900 rounded-lg shadow-xl border-3 border-gray-800 relative overflow-hidden" // SHRUNK SIZE
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                >
                    <video 
                        ref={videoRef}
                        key={currentSign.videoUrl} 
                        src={currentSign.videoUrl}
                        autoPlay={isPlaying}
                        muted
                        playsInline
                        className="w-full h-full object-contain"
                        style={{ transform: 'scaleX(-1)' }} 
                    />
                    
                    {/* Replay Controls & Info Overlay */}
                    <div className="absolute inset-0 flex flex-col justify-between p-3 bg-black/20">
                        {/* Top Info */}
                        <div className='flex justify-between items-start'>
                            <div className='bg-white/90 px-2 py-0.5 rounded-full text-gray-800 font-black text-sm border border-gray-800'> {/* SHRUNK TEXT */}
                                Letter: {currentSign.letter} ({currentSign.baseLabel})
                            </div>
                            <div className={`px-2 py-0.5 rounded-full text-white font-black text-sm border border-gray-800 ${currentSign.score >= 90 ? 'bg-teal-500' : currentSign.score >= 70 ? 'bg-yellow-500' : 'bg-pink-500'}`}> {/* SHRUNK TEXT */}
                                Score: {currentSign.score}%
                            </div>
                        </div>
                        
                        {/* Bottom Controls */}
                        <div className='flex justify-center items-center gap-3'>
                            <AnimatedButton 
                                onClick={() => {
                                    setCurrentReplayIndex(prev => (prev - 1 + totalSignsMastered) % totalSignsMastered);
                                    setIsPlaying(true); 
                                }}
                                variant="secondary"
                                className='p-2 text-xl' // SHRUNK BUTTON
                            >
                                <FiSkipBack />
                            </AnimatedButton>
                            
                            <AnimatedButton 
                                onClick={handleTogglePlay}
                                variant="primary"
                                className='p-3 text-2xl' // SHRUNK BUTTON
                            >
                                {isPlaying ? <FiPause /> : <FiPlay />}
                            </AnimatedButton>

                            <AnimatedButton 
                                onClick={() => {
                                    setCurrentReplayIndex(prev => (prev + 1) % totalSignsMastered);
                                    setIsPlaying(true); 
                                }}
                                variant="secondary"
                                className='p-2 text-xl' // SHRUNK BUTTON
                            >
                                <FiSkipForward />
                            </AnimatedButton>
                        </div>
                    </div>
                </motion.div>
            ) : (
                <div className='col-span-1 text-lg text-gray-500 font-bold p-8 border-2 border-dashed border-gray-300 rounded-xl w-full max-w-3xl mx-auto'> {/* SHRUNK TEXT/SIZE */}
                    No successful signs recorded! Try again!
                </div>
            )}

            {/* Email Submission Field */}
            <motion.div
                className="w-full max-w-3xl mx-auto mt-8 p-4 bg-gray-100 rounded-xl border-2 border-gray-800 shadow-[4px_4px_0px_#1f2937]"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.5 }}
            >
                <div className="flex items-center text-lg font-black text-gray-800 mb-2">
                    <FiMail className='mr-2' /> Email Your Performance Report
                </div>
                <div className="flex gap-2">
                    <input
                        type="email"
                        placeholder="Your Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={emailStatus === 'sending' || emailStatus === 'sent'}
                        className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-pink-500 transition duration-150"
                    />
                    <AnimatedButton 
                        onClick={handleSubmitEmail}
                        variant="primary"
                        disabled={!isValidEmail(email) || emailStatus === 'sending' || emailStatus === 'sent'}
                        className="px-4 py-3 text-sm"
                    >
                        {emailStatus === 'sending' ? (
                            <span className='flex items-center'><FiSend className='mr-2 animate-pulse' /> Sending...</span>
                        ) : emailStatus === 'sent' ? (
                            <span className='flex items-center text-white'><FiCheckCircle className='mr-2' /> Sent!</span>
                        ) : (
                            <span className='flex items-center'><FiSend className='mr-2' /> Send Report</span>
                        )}
                    </AnimatedButton>
                </div>
                <AnimatePresence>
                    {emailStatus === 'sent' && (
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className='text-sm text-teal-600 font-bold mt-2'
                        >
                            <FiCheckCircle className='inline mr-1' /> Report has been sent! Check your inbox.
                        </motion.p>
                    )}
                </AnimatePresence>
            </motion.div>
            
            {/* Action Buttons */}
            <motion.div 
              className="flex flex-col sm:flex-row gap-3 justify-center mt-8" // SHRUNK MARGIN
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
            >
              <AnimatedButton 
                onClick={() => navigate('/detection')}
                variant="primary"
                className="px-6 py-3 text-lg" // SHRUNK BUTTON
              >
                <span className="flex items-center justify-center"><FiRefreshCcw className="mr-2" /> Practice More!</span>
              </AnimatedButton>
              
              <AnimatedButton 
                onClick={() => navigate('/')}
                variant="secondary"
                className="px-6 py-3 text-lg" // SHRUNK BUTTON
              >
                <span className="flex items-center justify-center"><FiHome className="mr-2" /> Home Base</span>
              </AnimatedButton>
              
              <AnimatedButton 
                onClick={() => alert('Sharing your amazing BOLO progress with the world!')}
                variant="default"
                className="px-6 py-3 text-lg" // SHRUNK BUTTON
              >
                <span className="flex items-center justify-center"><FiShare2 className="mr-2" /> Share Glory</span>
              </AnimatedButton>
            </motion.div>
          </div>
        </motion.div>
      </div>
      
      {/* Footer Info Bar */}
      <div className="absolute bottom-4 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center items-center text-sm text-white filter drop-shadow-md z-10">
          <div className='flex items-center gap-2'>
              <FiVolumeX className='w-4 h-4' /> Sound Off | BOLO Challenge Complete!
          </div>
      </div>
    </div>
  );
};

export default Result; 
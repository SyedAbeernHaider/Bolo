import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiVolumeX } from 'react-icons/fi'; // Re-using a simple icon

// NOTE: Assuming Navbar and AnimatedButton components are still available,
// but they are not strictly needed on a single-focus loading screen.
// We'll use a simplified Navbar for theme continuity.

// --- Helper Components for Animation ---

// Component for a constantly moving hand emoji (The Core Animation)
const SigningEmoji = () => (
    <motion.div
        className="text-[100px] md:text-[140px] leading-none cursor-pointer filter drop-shadow-xl" 
        animate={{ 
            x: [0, 20, 0, -20, 0], // Exaggerated left-right movement (signing)
            rotate: [0, 15, -15, 0], // Exaggerated tilt/wobble
            scale: [1, 1.1, 1] // Slight breathing effect
        }}
        transition={{ 
            duration: 2, 
            ease: "easeInOut", 
            repeat: Infinity,
            rotate: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } // Faster rotation for energetic sign feel
        }}
    >
        👆 {/* Emoji for "Point" or "Attention" */}
    </motion.div>
);

// Component for a constantly wiggling star
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

// Floating Hand Emojis that move across the screen
const handEmojis = ['🤟', '✋', '👆', '🤲', '👌', '👍', '👐', '👋', '🤙', '✌️'];
const FloatingEmoji = ({ id, x, y, size, duration, delay, emoji }) => (
    <motion.div
        key={id}
        className="absolute"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          fontSize: `${size}px`,
          opacity: 0.7
        }}
        animate={{
          y: [0, -1000], // Move vertically off-screen
          x: [x, x + (Math.random() * 20 - 10)], // Subtle side drift
          rotate: [0, 360],
          opacity: [0.7, 0]
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

// --- Main Loading Component ---

const loadingMessages = [
  "Firing up the BOLO AI recognition engine...",
  "Loading the entire animated sign dictionary...",
  "Checking for the latest progress stickers...",
  "Just a quick wobble! Almost ready to sign...",
  "Welcome to BOLO! Starting your first lesson now!"
];

const Loading = () => {
  const navigate = useNavigate();
  const [currentMessage, setCurrentMessage] = useState(0);
  const [progress, setProgress] = useState(0);

  // Generate random positions for floating emojis once
  const floatingEmojis = Array(15).fill(0).map((_, i) => ({
    id: i,
    emoji: handEmojis[Math.floor(Math.random() * handEmojis.length)],
    size: Math.random() * 20 + 30,
    x: Math.random() * 100,
    y: 100 + Math.random() * 20, // Start just off the bottom
    duration: Math.random() * 10 + 10,
    delay: Math.random() * 5
  }));


  // Simulate loading progress
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          // 500ms delay after progress hits 100 for final visual
          const navTimer = setTimeout(() => navigate('/name-input'), 500); 
          return () => clearTimeout(navTimer);
        }
        return prev + (100 / 60); // Slower, smoother loading: Complete in ~6 seconds
      });
    }, 100);

    return () => clearInterval(timer);
  }, [navigate]);

  // Cycle through loading messages
  useEffect(() => {
    const messageTimer = setInterval(() => {
      // Only cycle messages if progress is below 95%
      if (progress < 95) {
          setCurrentMessage(prev => (prev + 1) % (loadingMessages.length - 1));
      } else {
          // Show the final message "Welcome to BOLO..." when progress is near complete
          setCurrentMessage(loadingMessages.length - 1);
      }
    }, 1500);
    
    return () => clearInterval(messageTimer);
  }, [progress]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 flex flex-col overflow-hidden relative border-8 border-gray-800">
      
      {/* Floating Emojis (Continuous GIF background) */}
      <div className="absolute inset-0 overflow-hidden">
        {floatingEmojis.map(props => <FloatingEmoji {...props} />)}
      </div>

      {/* Animated Decor Elements */}
      <WiggleStar size="5xl" position="top-10 left-1/4" />
      <WiggleStar size="4xl" position="bottom-20 right-1/4" />
      
      {/* Header/Nav - Simplified for focus */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-center items-center z-20 relative">
        <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
            <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.5 }}
          className="bg-white/95 backdrop-blur-sm p-8 rounded-3xl border-4 border-gray-800 shadow-[10px_10px_0px_#1f2937] w-full max-w-2xl text-center"
        >
          {/* Animated Hand */}
          <SigningEmoji />
          
          <motion.h2 
            className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-pink-600 to-teal-600 mb-6 filter drop-shadow"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            LOADING... Get Ready To Sign!
          </motion.h2>
          
          {/* Animated Messages */}
          <AnimatePresence mode="wait">
            <motion.p 
              key={currentMessage}
              className="text-xl text-gray-700 mb-8 min-h-[32px] font-semibold"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {loadingMessages[currentMessage]}
            </motion.p>
          </AnimatePresence>
          
          {/* Animated progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2 font-bold">
              <span>BOLO Progress</span>
              <motion.span 
                key={Math.round(progress)}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
              >
                {Math.min(100, Math.round(progress))}%
              </motion.span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6 border-2 border-gray-800 overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-yellow-400 via-pink-500 to-teal-500"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              />
            </div>
          </div>
          
          {/* Animated Bouncing Dots */}
          <div className="flex justify-center gap-4 mt-8">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-4 h-4 rounded-full border-2 border-gray-800"
                style={{ backgroundColor: ['#fde047', '#ec4899', '#2dd4bf'][i] }}
                animate={{
                  y: [0, -15, 0],
                  scale: [1, 1.2, 1]
                }}
                transition={{
                  duration: 1.0,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut'
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
      
      {/* Footer Info Bar */}
      <div className="absolute bottom-4 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center items-center text-sm text-white filter drop-shadow-md z-10">
          <div className='flex items-center gap-2'>
              <FiVolumeX className='w-4 h-4' /> Sound Off | Hyper-Animated Loading...
          </div>
      </div>
    </div>
  );
};

export default Loading;
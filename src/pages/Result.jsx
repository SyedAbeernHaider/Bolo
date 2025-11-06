import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiVolumeX, FiRefreshCcw, FiHome, FiShare2 } from 'react-icons/fi';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';

// --- Helper Components for Animation ---

// Navbar: Minimal and energetic
const Navbar = () => (
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-start items-center z-40 relative">
    <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
        <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
    </div>
  </nav>
);

// AnimatedButton: Designed to feel 'bouncy' and high-contrast
const AnimatedButton = ({ onClick, children, className = "", variant = 'default' }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-lg transition-all duration-300 transform border-4 border-gray-800";
    
    if (variant === 'primary') {
        baseStyle += " bg-teal-400 text-gray-800 hover:bg-teal-300 shadow-[8px_8px_0px_#1f2937]";
    } else if (variant === 'secondary') {
        baseStyle += " bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[8px_8px_0px_#1f2937]";
    } else {
        baseStyle += " bg-white text-gray-800 hover:bg-gray-100 shadow-[8px_8px_0px_#1f2937]";
    }

    return (
        <motion.button
            onClick={onClick}
            className={`${baseStyle} ${className} flex items-center justify-center relative overflow-hidden`}
            whileHover={{ scale: 1.03, boxShadow: "12px 12px 0px #1f2937", y: -2, rotate: 1 }} 
            whileTap={{ scale: 0.95, boxShadow: "4px 4px 0px #1f2937", y: 0, rotate: -1 }} 
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
  const { width, height } = useWindowSize();
  const [showConfetti, setShowConfetti] = useState(true);
  const [fireworkElements] = useState(
    Array(20).fill(0).map((_, i) => ({
      id: i,
      emoji: ['🎆', '🎇', '✨', '🎊', '🎉', '🎈', '💫', '🌟', '💥'][Math.floor(Math.random() * 9)],
      size: Math.random() * 40 + 20,
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: Math.random() * 2 + 1,
      delay: Math.random() * 2,
    }))
  );

  // Stats (simulated)
  const stats = {
    score: 92,
    signsLearned: 24,
    totalSigns: 26,
    timeSpent: '8:42',
    accuracy: '95%'
  };
  
  // Hide confetti after 8 seconds
  useEffect(() => {
    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 8000);
    
    return () => {
      clearTimeout(confettiTimer);
    };
  }, []);

  // Stats with icons
  const statItems = [
    { label: 'Final Score', value: `${stats.score}%`, icon: '🏆' },
    { label: 'Signs Mastered', value: `${stats.signsLearned}/${stats.totalSigns}`, icon: '🤟' },
    { label: 'BOLO Time', value: stats.timeSpent, icon: '⏱️' },
    { label: 'Accuracy Rating', value: stats.accuracy, icon: '🎯' }
  ];

  // Floating celebration emojis for continuous effect
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
      
      {/* Confetti (Z-index 50 to be on top) */}
      <AnimatePresence>
        {showConfetti && (
          <Confetti 
            width={width} 
            height={height} 
            recycle={false}
            numberOfPieces={600}
            gravity={0.3}
            colors={['#f43f5e', '#ec4899', '#fde047', '#2dd4bf', '#1f2937']} // Pink, Yellow, Teal, Black
            confettiSource={{ x: 0, y: height, w: width, h: 1 }}
            className='z-50'
          />
        )}
      </AnimatePresence>
      
      {/* Animated Fireworks (Simulated) */}
      <div className="fixed inset-0 pointer-events-none z-40">
        {fireworkElements.map((fw) => (
          <motion.div
            key={fw.id}
            className="absolute"
            style={{
              left: `${fw.x}%`,
              top: `${fw.y}%`,
              fontSize: `${fw.size}px`,
              transform: 'translate(-50%, -50%)',
            }}
            animate={{
              scale: [0, 1.5, 0],
              opacity: [0, 1, 0],
              rotate: [0, 180, 360]
            }}
            transition={{
              duration: fw.duration,
              delay: fw.delay,
              ease: 'easeOut',
              times: [0, 0.5, 1],
              repeat: 3, // Repeat a few times for continuous effect
              repeatDelay: 2 
            }}
          >
            {fw.emoji}
          </motion.div>
        ))}
      </div>

      {/* Floating Celebration Emojis */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingEmojis.map(props => <FloatingEmoji {...props} />)}
      </div>

      {/* Animated Decor Elements */}
      <WiggleStar size="5xl" position="top-20 right-1/4" />
      <WiggleStar size="4xl" position="bottom-10 left-10" />

      {/* Navigation (Z-index 40) */}
      <Navbar />
      
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-30">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ 
            scale: 1, 
            opacity: 1, 
            y: 0,
            rotate: [0, 0.5, -0.5, 0.5, 0] // Subtle continuous wobble
          }}
          transition={{ 
            type: 'spring', 
            stiffness: 150, 
            damping: 10,
            duration: 0.8,
            rotate: { repeat: Infinity, duration: 8, ease: "linear" }
          }}
          className="w-full max-w-4xl bg-white/95 backdrop-blur-sm rounded-3xl border-4 border-gray-800 shadow-[15px_15px_0px_#1f2937] p-8 md:p-12 relative overflow-hidden"
        >
          
          <div className="relative z-10">
            <div className="text-center mb-10">
              <motion.div 
                className="text-9xl mb-6"
                animate={{ 
                  y: [0, -20, 0], // Big bounce
                  scale: [1, 1.1, 1],
                  rotate: [0, 10, -10, 0]
                }}
                transition={{ 
                  duration: 2.5, 
                  repeat: Infinity, 
                  ease: 'easeInOut' 
                }}
              >
                💯
              </motion.div>
              
              <motion.h1 
                className="text-5xl md:text-7xl font-black text-gray-800 mb-4"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                MASTER SIGNER UNLOCKED!
              </motion.h1>
              
              <motion.p 
                className="text-xl md:text-2xl text-pink-600 font-black mb-8 max-w-2xl mx-auto"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                You crushed the BOLO Challenge! Time to celebrate! 💥
              </motion.p>
            </div>
            
            {/* Stats Grid - High Contrast */}
            <motion.div 
              className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              {statItems.map((stat, index) => (
                <motion.div 
                  key={stat.label}
                  className="bg-yellow-100 p-4 rounded-xl border-4 border-gray-800 shadow-[4px_4px_0px_#1f2937] text-center"
                  whileHover={{ 
                    y: -5,
                    boxShadow: '10px 10px 0px #1f2937',
                    scale: 1.05
                  }}
                  initial={{ opacity: 0, y: 20, rotate: -5 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: 0.6 + (index * 0.1), duration: 0.5 }}
                >
                  <div className="text-4xl mb-2">{stat.icon}</div>
                  <div className="text-3xl font-black text-teal-600">{stat.value}</div>
                  <div className="text-sm text-gray-800 font-semibold">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
            
            {/* Action Buttons */}
            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center mt-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
            >
              <AnimatedButton 
                onClick={() => navigate('/detection')}
                variant="primary"
                className="px-8 py-4 text-xl"
              >
                <span className="flex items-center justify-center"><FiRefreshCcw className="mr-2" /> Practice More Signs!</span>
              </AnimatedButton>
              
              <AnimatedButton 
                onClick={() => navigate('/')}
                variant="secondary"
                className="px-8 py-4 text-xl"
              >
                <span className="flex items-center justify-center"><FiHome className="mr-2" /> Back to Home Base</span>
              </AnimatedButton>
              
              <AnimatedButton 
                onClick={() => alert('Sharing your amazing BOLO progress with the world!')}
                variant="default"
                className="px-8 py-4 text-xl"
              >
                <span className="flex items-center justify-center"><FiShare2 className="mr-2" /> SHARE BOLO GLORY</span>
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
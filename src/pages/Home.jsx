import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiZap, FiVolumeX } from 'react-icons/fi';

// --- Placeholder Components ---

// Navbar: Minimal and energetic
const Navbar = () => (
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center z-20 relative">
    <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
        <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
    </div>
    <div className="text-sm text-white hover:text-yellow-400 transition duration-150 cursor-pointer font-bold uppercase filter drop-shadow">
      Handbook
    </div>
  </nav>
);

// AnimatedButton: Designed to feel 'bouncy' and high-contrast
const AnimatedButton = ({ onClick, children, className = "" }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-xl transition-all duration-300 transform border-4 border-gray-800 bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[8px_8px_0px_#1f2937]";

    return (
        <motion.button
            onClick={onClick}
            className={`${baseStyle} ${className} flex items-center justify-center`}
            whileHover={{ scale: 1.05, boxShadow: "12px 12px 0px #1f2937", y: -4 }} 
            whileTap={{ scale: 0.95, boxShadow: "4px 4px 0px #1f2937", y: 0 }} 
        >
            {children}
        </motion.button>
    );
};

// Component for the core animated signing hand
// Using a different sign emoji for variety, and a unique look
const BoloSigningHand = () => (
    <motion.div
        className="text-[140px] md:text-[200px] leading-none mb-6 cursor-pointer filter drop-shadow-xl" 
        animate={{ 
            y: [0, -10, 0], // Bouncing movement
            rotate: [0, 5, 0, -5, 0], // Wobbling movement
            scale: [1, 1.05, 1] 
        }}
        transition={{ 
            duration: 3, 
            ease: "easeInOut", 
            repeat: Infinity 
        }}
    >
        ✌️
    </motion.div>
);

// Component for a constantly wiggling star
const WiggleStar = ({ size, position }) => (
    <motion.div
        className={`absolute text-${size} ${position} filter drop-shadow`}
        animate={{ 
            rotate: [0, 30, -30, 0],
            scale: [1, 1.3, 1] 
        }}
        transition={{ 
            duration: 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
        }}
    >
        ⭐
    </motion.div>
);

// Component for a constantly moving word bubble
const FloatBubble = ({ content, position }) => (
    <motion.div
        className={`absolute text-xl md:text-2xl font-black uppercase text-gray-800 border-4 border-gray-800 rounded-full bg-white px-4 py-2 shadow-lg ${position}`}
        animate={{ 
            y: [0, -5, 0], // Floating up and down
            x: [0, 5, 0, -5, 0] // Gentle drift
        }}
        transition={{ 
            duration: 4, 
            repeat: Infinity, 
            ease: "easeInOut" 
        }}
    >
        {content}
    </motion.div>
);
// --------------------------------------------------------

const Home = () => {
  const navigate = useNavigate();
  const handleStart = () => navigate('/loading'); 

  return (
    // Min-h-screen for full-screen aesthetic
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 font-sans overflow-hidden relative border-8 border-gray-800">
      
      {/* Navigation */}
      <Navbar />

      {/* --- Full-Screen Hero Content Area --- */}
      <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-80px)] pt-12 pb-20 text-center">
        
        {/* Animated Decor Elements */}
        <WiggleStar size="5xl" position="top-20 left-10 hidden md:block" />
        <WiggleStar size="4xl" position="top-1/4 right-5" />
        <FloatBubble content="AI!" position="top-1/2 left-5 hidden md:block" />
        <FloatBubble content="FUN!" position="bottom-20 right-10" />

        {/* Animated Hand Icon - The core movement element */}
        <BoloSigningHand />

        <motion.h1 
          className="text-6xl md:text-8xl font-black text-white leading-tight mb-4 max-w-4xl mx-auto px-4 filter drop-shadow-2xl"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: "spring", stiffness: 120 }}
        >
          <span className="text-yellow-400">BOLO</span>. <br />
          <span className="text-white">Animated Sign Learning.</span>
        </motion.h1>
        
        <motion.p 
          className="text-xl md:text-2xl text-white mb-10 max-w-lg mx-auto px-4 filter drop-shadow-lg font-bold"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Watch it, Sign it, Master it. Let's make some motion!
        </motion.p>
        
        <motion.div 
          className="flex justify-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <AnimatedButton 
            onClick={handleStart}
            className="text-2xl"
          >
            <FiZap className="mr-2 w-6 h-6" />
            Start Animated BOLO!
          </AnimatedButton>
        </motion.div>
        
        {/* Static Info Bar at the very bottom */}
        <div className="absolute bottom-4 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center items-center text-sm text-white filter drop-shadow-md">
            <div className='flex items-center gap-2'>
                <FiVolumeX className='w-4 h-4' /> Sound Off | Powered by Motion & AI
            </div>
        </div>

      </div>
      
    </div>
  );
};

export default Home;
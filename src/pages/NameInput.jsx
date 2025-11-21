import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiVolumeX } from 'react-icons/fi';

// =================================================================
// 🎨 HELPER UI COMPONENTS
// =================================================================

const Navbar = () => (
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-start items-center z-20 relative">
    <div className="text-4xl font-black tracking-wider text-white filter drop-shadow-lg">
        <span className="text-yellow-400">B</span><span className="text-pink-500">O</span><span className="text-teal-400">L</span><span className="text-yellow-400">O</span>
    </div>
  </nav>
);

const AnimatedButton = ({ onClick, children, className = "", type = 'button', disabled = false }) => {
    let baseStyle = "px-8 py-4 rounded-xl font-extrabold text-xl transition-all duration-300 transform border-4 border-gray-800";
    
    if (disabled) {
        baseStyle += " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed";
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

const handEmojis = ['✍️', '👋', '👆', '🤟', '🤚', '🖐️', '✋', '🖖', '👌', '🤌'];
const FloatingEmoji = ({ id, x, y, size, duration, delay, emoji }) => (
    <motion.div
        key={id}
        className="absolute"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          fontSize: `${size}px`,
          opacity: 0.2
        }}
        animate={{
          y: [0, -1000], 
          x: [x, x + (Math.random() * 20 - 10)], 
          rotate: [0, 360],
          opacity: [0.2, 0]
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

const BouncingCharacter = () => (
    <motion.div 
        className="text-8xl mb-6"
        animate={{ 
            y: [0, -15, 0], // Exaggerated bounce
            rotate: [0, 5, -5, 0], // Wiggle
        }}
        transition={{ 
            duration: 3.5, 
            repeat: Infinity, 
            ease: 'easeInOut' 
        }}
    >
        ✏️
    </motion.div>
);

// =================================================================
// 🧠 MAIN COMPONENT: NameInput
// =================================================================

const NameInput = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const [validationError, setValidationError] = useState(''); // New state for validation message

  // Generate random positions for floating emojis once
  const floatingEmojis = Array(15).fill(0).map((_, i) => ({
    id: i,
    emoji: handEmojis[Math.floor(Math.random() * handEmojis.length)],
    size: Math.random() * 20 + 30,
    x: Math.random() * 100,
    y: 100 + Math.random() * 20, 
    duration: Math.random() * 10 + 10,
    delay: Math.random() * 5
  }));

  /**
   * Input Change Handler: Enforces A-Z only.
   * This prevents users from even typing invalid characters (spaces, numbers, symbols).
   */
  const handleNameChange = (e) => {
    const rawValue = e.target.value;
    
    // REGEX FIX: Keep only characters that are A-Z (case insensitive).
    // The [^A-Za-z] matches anything *not* a letter. We replace it with an empty string.
    const filteredValue = rawValue.replace(/[^A-Za-z]/g, ''); 
    
    setName(filteredValue);

    // Reset error states on change
    if (shake) setShake(false);
    if (validationError) setValidationError('');
  };

  /**
   * Form Submission Handler: Final validation and navigation.
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 1. Check for empty input (already filtered for non-A-Z)
    if (!name.trim()) {
      setValidationError("Whoops! We need a name to start.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    // 2. Validate that the name still contains characters after filtering
    const validNameLetters = name.toUpperCase().split('');
    
    // Since the onChange handler already filtered non-A-Z, we just check length.
    if (validNameLetters.length === 0) {
      setValidationError("Please enter a name containing only letters (A-Z).");
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }

    setIsSubmitting(true);

    console.log(`Starting BOLO challenge for: ${name}. Letters to sign: ${validNameLetters.join(', ')}`);

    // Add a delay for better UX
    setTimeout(() => {
      // Navigate to detection page with validated name letters
      navigate('/detection', {
        state: {
          userName: name,
          nameLetters: validNameLetters
        }
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 flex flex-col overflow-hidden relative border-8 border-gray-800">
      
      {/* Floating Emojis */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingEmojis.map(props => <FloatingEmoji key={props.id} {...props} />)}
      </div>
      
      {/* Animated Decor Elements */}
      <WiggleStar size="5xl" position="top-20 right-1/4" />
      <WiggleStar size="4xl" position="bottom-10 left-10" />

      <Navbar />
      
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ 
            scale: 1, 
            opacity: 1, 
            y: 0,
            rotate: shake ? [0, -5, 5, -5, 5, 0] : [0, 0.5, -0.5, 0.5, 0], 
            x: shake ? [0, -10, 10, -10, 10, 0] : 0 
          }}
          transition={{ 
            type: 'spring', 
            stiffness: 150, 
            damping: 10,
            duration: 0.8,
            rotate: { repeat: Infinity, duration: 8, ease: "linear" },
            x: { duration: 0.6 }
          }}
          className="bg-white/95 backdrop-blur-sm p-8 md:p-12 rounded-3xl border-4 border-gray-800 shadow-[10px_10px_0px_#1f2937] w-full max-w-lg relative overflow-hidden"
        >
          <motion.div 
            className="text-center mb-10 relative z-10"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <BouncingCharacter />
            <h2 className="text-4xl md:text-5xl font-black text-gray-800 mb-3">
              WHAT'S YOUR BOLO NAME?
            </h2>
            <p className="text-lg text-gray-700 font-semibold">Ready to start our sign adventure?</p>
          </motion.div>
          
          <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
            <motion.div 
              className="relative"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
            >
              <motion.input
                type="text"
                value={name}
                onChange={handleNameChange} // Use the new filtering handler
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className={`w-full px-6 py-4 text-xl font-bold rounded-xl border-4 border-gray-800 transition-all duration-200 focus:ring-4 focus:ring-teal-300 focus:outline-none focus:bg-yellow-50 ${
                  isFocused ? 'shadow-xl' : 'shadow-[4px_4px_0px_#1f2937] hover:shadow-[6px_6px_0px_#1f2937]'
                } ${shake ? 'border-red-500 bg-red-50' : 'bg-white'}`}
                placeholder="Type your name (Letters A-Z only)..." // Updated placeholder for clarity
                disabled={isSubmitting}
                required
              />
              
              {/* Animated underline indicator with stroke effect */}
              <motion.div 
                className="absolute -bottom-2 left-0 h-1.5 bg-gradient-to-r from-pink-500 via-teal-500 to-yellow-400 rounded-full"
                initial={{ width: '0%' }}
                animate={{ 
                  width: isFocused ? '100%' : '0%',
                  opacity: isFocused ? 1 : 0
                }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
               <AnimatePresence>
                {isFocused && (
                    <motion.div 
                        key="writing-tip"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                    >
                        <motion.span 
                            animate={{ y: [0, -5, 0], rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                            ✍️
                        </motion.span>
                    </motion.div>
                )}
              </AnimatePresence>

              {validationError && (
                <motion.p 
                  className="text-red-600 text-sm mt-3 flex items-center font-bold"
                  key="error-message"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="mr-1">⚠️</span> {validationError}
                </motion.p>
              )}
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5 }}
            >
              <AnimatedButton 
                type="submit" 
                className="w-full text-2xl"
                disabled={!name.trim() || isSubmitting}
              >
                <AnimatePresence mode="wait">
                  {isSubmitting ? (
                    <motion.span 
                      key="loading"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="flex items-center justify-center"
                    >
                      <motion.span 
                        className="inline-block mr-3 text-3xl"
                        animate={{ 
                            rotate: 360, 
                            scale: [1, 1.2, 1],
                        }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        ⏳
                      </motion.span>
                      BOLO-ing... Hold On!
                    </motion.span>
                  ) : (
                    <motion.span 
                      key="text"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="flex items-center justify-center"
                    >
                      <span className="mr-3 text-3xl">🚀</span> Let's Sign Your Name! 
                      <FiArrowRight className='ml-2 w-6 h-6' />
                    </motion.span>
                  )}
                </AnimatePresence>
              </AnimatedButton>
            </motion.div>
          </form>
          
          <motion.div 
            className="mt-8 text-center text-sm text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <p>Your name is safe with BOLO. We respect your privacy.</p>
          </motion.div>
        </motion.div>
      </div>
      
      {/* Footer Info Bar */}
      <div className="absolute bottom-4 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center items-center text-sm text-white filter drop-shadow-md z-10">
          <div className='flex items-center gap-2'>
              <FiVolumeX className='w-4 h-4' /> Sound Off
          </div>
      </div>
    </div>
  );
};

export default NameInput;
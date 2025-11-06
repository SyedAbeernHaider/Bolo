import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <motion.nav 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className="fixed top-0 left-0 right-0 bg-white bg-opacity-80 backdrop-blur-md z-50 shadow-sm"
    >
      <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
        <Link to="/" className="flex items-center">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-3xl mr-2"
          >
            🖐️
          </motion.div>
          <span className="text-xl font-bold text-indigo-600">BOLO</span>
        </Link>
        
        <div className="flex gap-4">
          <Link 
            to="/" 
            className="px-4 py-2 rounded-full hover:bg-indigo-50 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;

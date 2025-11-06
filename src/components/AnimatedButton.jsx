import { motion } from 'framer-motion';

const AnimatedButton = ({ 
  children, 
  onClick, 
  className = '', 
  disabled = false,
  variant = 'primary' 
}) => {
  const baseClasses = 'px-6 py-3 rounded-full font-medium transition-colors';
  
  const variantClasses = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600',
    secondary: 'bg-white text-indigo-600 border-2 border-indigo-500 hover:bg-indigo-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    success: 'bg-green-500 text-white hover:bg-green-600',
    disabled: 'bg-gray-300 text-gray-500 cursor-not-allowed'
  };

  const buttonClass = `${baseClasses} ${variantClasses[disabled ? 'disabled' : variant]} ${className}`;

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.03 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className={buttonClass}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
};

export default AnimatedButton;

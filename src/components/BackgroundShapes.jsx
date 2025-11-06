import { motion } from 'framer-motion';

const BackgroundShapes = ({ count = 10 }) => {
  const shapes = [
    { emoji: '🔵', size: 30, duration: 15 },
    { emoji: '🟡', size: 40, duration: 20 },
    { emoji: '🟢', size: 25, duration: 25 },
    { emoji: '🔴', size: 35, duration: 18 },
    { emoji: '🟣', size: 45, duration: 22 },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {[...Array(count)].map((_, i) => {
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const size = shape.size * (0.5 + Math.random() * 1.5);
        
        return (
          <motion.div
            key={i}
            initial={{
              x: Math.random() * 100 + 'vw',
              y: Math.random() * 100 + 'vh',
              rotate: Math.random() * 360,
              scale: 0
            }}
            animate={{
              x: [
                Math.random() * 100 + 'vw',
                Math.random() * 100 + 'vw',
                Math.random() * 100 + 'vw'
              ],
              y: [
                Math.random() * 100 + 'vh',
                Math.random() * 100 + 'vh',
                Math.random() * 100 + 'vh'
              ],
              rotate: [0, 180, 360],
              scale: [0, 1, 0],
              opacity: [0, 0.5, 0]
            }}
            transition={{
              duration: shape.duration,
              repeat: Infinity,
              repeatType: 'loop',
              ease: 'easeInOut',
              times: [0, 0.5, 1]
            }}
            className="absolute text-4xl opacity-30"
            style={{
              fontSize: `${size}px`,
              filter: 'blur(1px)'
            }}
          >
            {shape.emoji}
          </motion.div>
        );
      })}
    </div>
  );
};

export default BackgroundShapes;

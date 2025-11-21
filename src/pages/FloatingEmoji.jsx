const FloatingEmoji = (props) => {
  const { id, x, y, size, duration, delay, emoji } = props;
  return (
    <motion.div
      key={id}
      className="absolute text-4xl z-10"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        fontSize: `${size}px`,
        opacity: 0.8,
      }}
      animate={{
        y: [0, -1000],
        x: [x, x + (Math.random() * 20 - 10)],
        rotate: [0, 360],
        opacity: [0.8, 0],
      }}
      transition={{
        duration: duration,
        delay: delay,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      {emoji}
    </motion.div>
  );
};

export default FloatingEmoji;

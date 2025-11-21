import { motion } from "framer-motion";

const WiggleStar = (props) => {
  const { size, position } = props;
  return (
    <motion.div
      className={`absolute text-${size} ${position} filter drop-shadow opacity-70 z-30`}
      animate={{ rotate: [0, 30, -30, 0], scale: [1, 1.3, 1] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
    >
      🌟
    </motion.div>
  );
};

export default WiggleStar;

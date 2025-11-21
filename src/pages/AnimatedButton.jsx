import { motion } from "framer-motion";

const AnimatedButton = (props) => {
    const { onClick,
        children,
        className = "",
        variant = "default",
        disabled = false } = props;
    let baseStyle =
        "px-4 py-2 rounded-xl font-extrabold text-lg transition-all duration-300 transform border-4 border-gray-800";

    if (disabled) {
        baseStyle +=
            " bg-gray-400 text-gray-700 shadow-[4px_4px_0px_#4b5563] cursor-not-allowed";
    } else if (variant === "primary") {
        baseStyle +=
            " bg-teal-400 text-gray-800 hover:bg-teal-300 shadow-[6px_6px_0px_#1f2937]";
    } else if (variant === "secondary") {
        baseStyle +=
            " bg-yellow-400 text-gray-800 hover:bg-yellow-300 shadow-[6px_6px_0px_#1f2937]";
    } else {
        baseStyle +=
            " bg-white text-gray-800 hover:bg-gray-100 shadow-[6px_6px_0px_#1f2937]";
    }

    return (
        <motion.button
            onClick={onClick}
            className={`${baseStyle} ${className} flex items-center justify-center relative overflow-hidden`}
            whileHover={
                !disabled
                    ? {
                        scale: 1.03,
                        boxShadow: "8px 8px 0px #1f2937",
                        y: -2,
                        rotate: 0.5,
                    }
                    : {}
            }
            whileTap={
                !disabled
                    ? {
                        scale: 0.95,
                        boxShadow: "4px 4px 0px #1f2937",
                        y: 0,
                        rotate: -0.5,
                    }
                    : {}
            }
            disabled={disabled}
        >
            {children}
        </motion.button>
    );
}

export default AnimatedButton
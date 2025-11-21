import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiRefreshCcw,
  FiHome,
  FiShare2,
  FiPlay,
  FiPause,
  FiSkipBack,
  FiSkipForward,
  FiMail,
  FiSend,
  FiCheckCircle,
  FiDownload,
  FiLoader,
  FiVolumeX,
  FiUploadCloud,
} from "react-icons/fi";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import emailjs from "@emailjs/browser";
import { storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import Navbar from "./Navbar";
import AnimatedButton from "./AnimatedButton";
import { fireworkElements, floatingEmojis } from "../utils/utils";

const Result = () => {
  const videoRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { width, height } = useWindowSize();
  const {
    recordedSigns = [],
    userName = "Signer",
    totalSignsAttempted = 0,
  } = location.state || {};

  const [showConfetti, setShowConfetti] = useState(true);
  const [email, setEmail] = useState("");
  
  const [currentReplayIndex, setCurrentReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [processStatus, setProcessStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());

  const currentSign =
    recordedSigns.length > 0 ? recordedSigns[currentReplayIndex] : null;
  const totalSignsMastered = recordedSigns.length;

  const loadFfmpeg = async () => {
    const ffmpeg = ffmpegRef.current;

    ffmpeg.on("log", ({ message }) => {
      console.log("FFmpeg Log:", message);
    });

    if (ffmpeg.loaded) {
      setFfmpegLoaded(true);
      return;
    }

    try {
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });
      console.log("FFmpeg Loaded Successfully!");
      setFfmpegLoaded(true);
    } catch (error) {
      console.error("FFmpeg Load Error:", error);
      // Sometimes logging the full error object helps
      if (error.message && error.message.includes("SharedArrayBuffer")) {
        console.error("This error is due to missing headers in vite.config.js");
      }
    }
  };

  useEffect(() => {
    loadFfmpeg();
  }, []);

  const handleDownloadMergedVideo = async () => {
    if (!ffmpegLoaded) {
      alert("Video processor hasn't loaded yet. Please wait a moment.");
      return;
    }
    if (recordedSigns.length === 0) return;

    setIsMerging(true);
    const ffmpeg = ffmpegRef.current;

    try {
      // 1. Write all video clips to FFmpeg's virtual file system
      // We use a loop to fetch the blob data from the objectURL and write it
      const fileNames = [];
      for (let i = 0; i < recordedSigns.length; i++) {
        const fileName = `input${i}.webm`; // Assuming webm from MediaRecorder
        const sign = recordedSigns[i];

        // Fetch the data from the blob URL
        await ffmpeg.writeFile(fileName, await fetchFile(sign.videoUrl));
        fileNames.push(fileName);
      }

      // 2. Create a text file list for the concat demuxer
      // Format: file 'filename.webm'
      const listContent = fileNames.map((name) => `file '${name}'`).join("\n");
      await ffmpeg.writeFile("list.txt", listContent);

      // 3. Run the concat command
      // -f concat: use concat demuxer
      // -safe 0: allow unsafe file paths (needed for virtual fs)
      // -i list.txt: input list
      // -c copy: copy stream (fast, no re-encoding)
      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "output.webm",
      ]);

      // 4. Read the output file
      const data = await ffmpeg.readFile("output.webm");

      // 5. Create a downloadable URL
      const url = URL.createObjectURL(
        new Blob([data.buffer], { type: "video/webm" })
      );

      // 6. Trigger Download
      const a = document.createElement("a");
      a.href = url;
      a.download = `${userName}_BOLO_Full_Performance.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Cleanup
      URL.revokeObjectURL(url);

      // Optional: Delete files from memory to free up space
      await ffmpeg.deleteFile("output.webm");
      await ffmpeg.deleteFile("list.txt");
      for (const name of fileNames) {
        await ffmpeg.deleteFile(name);
      }
    } catch (error) {
      console.error("Error merging videos:", error);
      alert("Could not merge videos. Please try again.");
    } finally {
      setIsMerging(false);
    }
  };

  const handleMergeAndSend = async () => {
    if (!ffmpegLoaded) {
      alert("Video engine loading...");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      alert("Please enter a valid email.");
      return;
    }

    setProcessStatus("merging");
    setStatusMessage("Stitching video clips...");
    const ffmpeg = ffmpegRef.current;

    try {
      // --- STEP A: MERGE VIDEOS ---
      const fileNames = [];
      for (let i = 0; i < recordedSigns.length; i++) {
        const fileName = `input${i}.webm`;
        await ffmpeg.writeFile(
          fileName,
          await fetchFile(recordedSigns[i].videoUrl)
        );
        fileNames.push(fileName);
      }
      const listContent = fileNames.map((name) => `file '${name}'`).join("\n");
      await ffmpeg.writeFile("list.txt", listContent);

      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "output.webm",
      ]);

      const data = await ffmpeg.readFile("output.webm");
      const videoBlob = new Blob([data.buffer], { type: "video/webm" });

      // --- NEW: GENERATE THUMBNAIL ---
      // Take a screenshot at the 1-second mark (-ss 00:00:01)
      await ffmpeg.exec([
        "-i",
        "output.webm",
        "-ss",
        "00:00:01",
        "-frames:v",
        "1",
        "thumbnail.jpg",
      ]);
      const thumbData = await ffmpeg.readFile("thumbnail.jpg");
      const thumbBlob = new Blob([thumbData.buffer], { type: "image/jpeg" });
      // Clean up FFmpeg memory
      await ffmpeg.deleteFile("output.webm");
      await ffmpeg.deleteFile("thumbnail.jpg"); // Delete thumb
      await ffmpeg.deleteFile("list.txt");
      for (const name of fileNames) await ffmpeg.deleteFile(name);

      // --- STEP B: UPLOAD TO FIREBASE ---
      setProcessStatus("uploading");
      setStatusMessage("Uploading to cloud...");

      const uniqueId = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const videoRef = ref(
        storage,
        `bolo_performances/${userName}_${uniqueId}.webm`
      );

      await uploadBytes(videoRef, videoBlob);
      const downloadURL = await getDownloadURL(videoRef);
      console.log("File available at", downloadURL);

      const thumbRef = ref(
        storage,
        `bolo_performances/${userName}_${uniqueId}.jpg`
      );
      await uploadBytes(thumbRef, thumbBlob);
      const thumbURL = await getDownloadURL(thumbRef);
      // --- STEP C: SEND EMAIL ---
      setProcessStatus("sending_email");
      setStatusMessage("Dispatching email...");

      // REPLACE THESE WITH YOUR EMAILJS CREDENTIALS
      const SERVICE_ID = "service_hjcgutd";
      const TEMPLATE_ID = "template_lthtia6";
      const PUBLIC_KEY = "tUMWweeJ3LuLXsDJH";

      const templateParams = {
        email,
        user_name: userName,
        name: userName,
        video_link: downloadURL,
        thumbnail_link: thumbURL,
        message: `Great job! You scored ${Math.round(
          recordedSigns.reduce((a, b) => a + b.score, 0) / recordedSigns.length
        )}% accuracy.`,
      };

      await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);

      setProcessStatus("success");
      setStatusMessage("Sent Successfully!");

      // Reset status after a delay
      setTimeout(() => {
        setProcessStatus("idle");
        setStatusMessage("");
      }, 5000);
    } catch (error) {
      console.error("Workflow Error:", error);
      setProcessStatus("error");
      setStatusMessage("Failed. Check console.");
    }
  };
  useEffect(() => {
    return () => {
      recordedSigns.forEach((sign) => {
        if (sign.videoUrl) URL.revokeObjectURL(sign.videoUrl);
      });
    };
  }, [recordedSigns]);

  const handleNextReplay = useCallback(() => {
    if (!isPlaying || totalSignsMastered === 0) return;
    setCurrentReplayIndex((prev) => (prev + 1) % totalSignsMastered);
    if (videoRef.current) {
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch((e) => setIsPlaying(false));
        }
      }, 50);
    }
  }, [currentReplayIndex, totalSignsMastered, isPlaying]);

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
    if (videoRef.current)
      isPlaying ? videoRef.current.pause() : videoRef.current.play();
  };

  useEffect(() => {
    if (totalSignsMastered > 0 && videoRef.current) {
      videoRef.current.onended = handleNextReplay;
      if (isPlaying) videoRef.current.play().catch(() => setIsPlaying(false));
      return () => {
        if (videoRef.current) videoRef.current.onended = null;
      };
    }
  }, [totalSignsMastered, isPlaying, handleNextReplay, currentReplayIndex]);

  // --- STATS & UTILS ---
  const totalScore = recordedSigns.reduce((sum, sign) => sum + sign.score, 0);
  const averageScore =
    totalSignsMastered > 0 ? Math.round(totalScore / totalSignsMastered) : 0;
  const masteryRatio = `${totalSignsMastered}/${totalSignsAttempted}`;

  const statItems = [
    { label: "Avg. Score", value: `${averageScore}%`, icon: "🏆" },
    { label: "Signs Mastered", value: masteryRatio, icon: "🤟" },
    { label: "Signs Attempted", value: totalSignsAttempted, icon: "🎯" },
    {
      label: "Accuracy Rating",
      value:
        averageScore >= 90 ? "Excellent" : averageScore >= 70 ? "Good" : "Fair",
      icon: "✨",
    },
  ];

  useEffect(() => {
    const confettiTimer = setTimeout(() => setShowConfetti(false), 8000);
    return () => clearTimeout(confettiTimer);
  }, []);

  
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-teal-500 flex flex-col overflow-hidden relative border-8 border-gray-800">
      {/* Confetti & Fireworks */}
      <AnimatePresence>
        {showConfetti && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={600}
            gravity={0.3}
            colors={["#f43f5e", "#ec4899", "#fde047", "#2dd4bf", "#1f2937"]}
            confettiSource={{ x: 0, y: height, w: width, h: 1 }}
            className="z-50"
          />
        )}
      </AnimatePresence>
      <div className="fixed inset-0 pointer-events-none z-40">
        {fireworkElements.map((fw) => (
          <motion.div
            key={fw.id}
            className="absolute"
            style={{
              left: `${fw.x}%`,
              top: `${fw.y}%`,
              fontSize: `${fw.size}px`,
              transform: "translate(-50%, -50%)",
            }}
            animate={{
              scale: [0, 1.5, 0],
              opacity: [0, 1, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: fw.duration,
              delay: fw.delay,
              ease: "easeOut",
              times: [0, 0.5, 1],
              repeat: 3,
              repeatDelay: 2,
            }}
          >
            {fw.emoji}
          </motion.div>
        ))}
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingEmojis.map((props) => (
          <FloatingEmoji key={props.id} {...props} />
        ))}
      </div>

      <WiggleStar size="3xl" position="top-10 right-1/4" />
      <WiggleStar size="2xl" position="bottom-10 left-10" />

      <Navbar />

      <div className="flex-1 flex flex-col items-center p-4 relative z-30 overflow-y-auto">
        <motion.div
          initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
          animate={{
            scale: 1,
            opacity: 1,
            y: 0,
            rotate: [0, 0.2, -0.2, 0.2, 0],
          }}
          transition={{
            type: "spring",
            stiffness: 150,
            damping: 10,
            duration: 0.8,
            rotate: { repeat: Infinity, duration: 8, ease: "linear" },
          }}
          className="w-full max-w-4xl bg-white/95 backdrop-blur-sm rounded-2xl border-4 border-gray-800 shadow-[10px_10px_0px_#1f2937] p-6 md:p-8 relative overflow-hidden my-auto"
        >
          <div className="relative z-10">
            <div className="text-center mb-8">
              <motion.h1
                className="text-3xl md:text-5xl font-black text-gray-800 mb-2"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                CONGRATULATIONS!
              </motion.h1>

              <motion.p
                className="text-xl md:text-3xl text-pink-600 font-black mb-4"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                You have successfully signed your name:{" "}
                <span className="text-teal-600 underline">
                  {userName.toUpperCase()}
                </span>
                !
              </motion.p>
            </div>

            {/* Stats Grid */}
            <motion.div
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              {statItems.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  className="bg-yellow-100 p-3 rounded-xl border-2 border-gray-800 shadow-[2px_2px_0px_#1f2937] text-center"
                  initial={{ opacity: 0, y: 20, rotate: -2 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
                >
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <div className="text-xl font-black text-teal-600">
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-800 font-semibold">
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Video Replay Section */}
            <h2 className="text-2xl font-black text-gray-800 border-b-2 border-pink-500 pb-1 mb-4 text-center">
              Your Signed Alphabet Replay ({currentReplayIndex + 1}/
              {totalSignsMastered})
            </h2>

            {totalSignsMastered > 0 && currentSign ? (
              <motion.div
                key={currentReplayIndex}
                className="aspect-video w-full max-w-3xl mx-auto bg-gray-900 rounded-lg shadow-xl border-3 border-gray-800 relative overflow-hidden"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <video
                  ref={videoRef}
                  key={currentSign.videoUrl}
                  src={currentSign.videoUrl}
                  autoPlay={isPlaying}
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                  style={{ transform: "scaleX(-1)" }}
                />

                <div className="absolute inset-0 flex flex-col justify-between p-3 bg-black/20">
                  <div className="flex justify-between items-start">
                    <div className="bg-white/90 px-2 py-0.5 rounded-full text-gray-800 font-black text-sm border border-gray-800">
                      Letter: {currentSign.letter} ({currentSign.baseLabel})
                    </div>
                    <div
                      className={`px-2 py-0.5 rounded-full text-white font-black text-sm border border-gray-800 ${
                        currentSign.score >= 90
                          ? "bg-teal-500"
                          : currentSign.score >= 70
                          ? "bg-yellow-500"
                          : "bg-pink-500"
                      }`}
                    >
                      Score: {currentSign.score}%
                    </div>
                  </div>

                  <div className="flex justify-center items-center gap-3">
                    <AnimatedButton
                      onClick={() => {
                        setCurrentReplayIndex(
                          (prev) =>
                            (prev - 1 + totalSignsMastered) % totalSignsMastered
                        );
                        setIsPlaying(true);
                      }}
                      variant="secondary"
                      className="p-2 text-xl"
                    >
                      <FiSkipBack />
                    </AnimatedButton>

                    <AnimatedButton
                      onClick={handleTogglePlay}
                      variant="primary"
                      className="p-3 text-2xl"
                    >
                      {isPlaying ? <FiPause /> : <FiPlay />}
                    </AnimatedButton>

                    <AnimatedButton
                      onClick={() => {
                        setCurrentReplayIndex(
                          (prev) => (prev + 1) % totalSignsMastered
                        );
                        setIsPlaying(true);
                      }}
                      variant="secondary"
                      className="p-2 text-xl"
                    >
                      <FiSkipForward />
                    </AnimatedButton>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="col-span-1 text-lg text-gray-500 font-bold p-8 border-2 border-dashed border-gray-300 rounded-xl w-full max-w-3xl mx-auto">
                No successful signs recorded! Try again!
              </div>
            )}

            {/* --- EMAIL & DOWNLOAD SECTION --- */}
            <motion.div
              className="w-full max-w-3xl mx-auto mt-8 flex flex-col gap-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
            >
              {/* Email Input */}
              <div className="p-4 bg-gray-100 rounded-xl border-2 border-gray-800 shadow-[4px_4px_0px_#1f2937]">
                <div className="flex items-center text-lg font-black text-gray-800 mb-2">
                  <FiMail className="mr-2" /> Email Your Performance Report
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    // disabled={
                    //   emailStatus === "sending" || emailStatus === "sent"
                    // }
                    disabled={
                      processStatus !== "idle" &&
                      processStatus !== "error" &&
                      processStatus !== "success"
                    }
                    className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-pink-500 transition duration-150"
                  />
                  <AnimatedButton
                    onClick={handleMergeAndSend}
                    variant="primary"
                    disabled={
                      (processStatus !== "idle" &&
                        processStatus !== "error" &&
                        processStatus !== "success") ||
                      totalSignsMastered === 0
                    }
                    className="px-4 py-3 text-sm"
                  >
                    {processStatus === "idle" && (
                      <span className="flex items-center">
                        <FiSend className="mr-2" /> Send Report
                      </span>
                    )}
                    {processStatus === "merging" && (
                      <span className="flex items-center">
                        <FiLoader className="mr-2 animate-spin" /> Merging...
                      </span>
                    )}
                    {processStatus === "uploading" && (
                      <span className="flex items-center">
                        <FiUploadCloud className="mr-2 animate-pulse" />{" "}
                        Uploading...
                      </span>
                    )}
                    {processStatus === "sending_email" && (
                      <span className="flex items-center">
                        <FiMail className="mr-2 animate-bounce" /> Emailing...
                      </span>
                    )}
                    {processStatus === "success" && (
                      <span className="flex items-center">
                        <FiCheckCircle className="mr-2" /> Sent!
                      </span>
                    )}
                    {processStatus === "error" && (
                      <span className="flex items-center">Retry?</span>
                    )}
                  </AnimatedButton>
                </div>
                <AnimatePresence>
                  {processStatus !== "idle" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`mt-2 font-bold text-sm ${
                        processStatus === "error"
                          ? "text-red-600"
                          : "text-teal-600"
                      }`}
                    >
                      {statusMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Video Merge Button */}
              <div className="p-4 bg-teal-100 rounded-xl border-2 border-gray-800 shadow-[4px_4px_0px_#1f2937] flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-800 flex items-center">
                    <FiDownload className="mr-2" /> Full Video Compilation
                  </h3>
                  <p className="text-sm text-gray-600">
                    Download a single video of your entire name sign.
                  </p>
                </div>
                <AnimatedButton
                  onClick={handleDownloadMergedVideo}
                  variant="secondary"
                  disabled={
                    isMerging || !ffmpegLoaded || totalSignsMastered === 0
                  }
                  className="px-4 py-2"
                >
                  {isMerging ? (
                    <span className="flex items-center">
                      <FiLoader className="mr-2 animate-spin" /> Processing...
                    </span>
                  ) : (
                    <span className="flex items-center">Download Video</span>
                  )}
                </AnimatedButton>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              className="flex flex-col sm:flex-row gap-3 justify-center mt-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
            >
              <AnimatedButton
                onClick={() => navigate("/detection")}
                variant="primary"
                className="px-6 py-3 text-lg"
              >
                <span className="flex items-center justify-center">
                  <FiRefreshCcw className="mr-2" /> Practice More!
                </span>
              </AnimatedButton>

              <AnimatedButton
                onClick={() => navigate("/")}
                variant="secondary"
                className="px-6 py-3 text-lg"
              >
                <span className="flex items-center justify-center">
                  <FiHome className="mr-2" /> Home Base
                </span>
              </AnimatedButton>

              <AnimatedButton
                onClick={() =>
                  alert("Sharing your amazing BOLO progress with the world!")
                }
                variant="default"
                className="px-6 py-3 text-lg"
              >
                <span className="flex items-center justify-center">
                  <FiShare2 className="mr-2" /> Share Glory
                </span>
              </AnimatedButton>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center items-center text-sm text-white filter drop-shadow-md z-10">
        <div className="flex items-center gap-2">
          <FiVolumeX className="w-4 h-4" /> Sound Off | BOLO Challenge Complete!
        </div>
      </div>
    </div>
  );
};

export default Result;

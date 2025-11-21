export const fireworkElements = Array(20)
    .fill(0)
    .map((_, i) => ({
        id: i,
        emoji: ["🎆", "🎇", "✨", "🎊", "🎉", "🎈", "💫", "🌟", "💥"][
            Math.floor(Math.random() * 9)
        ],
        size: Math.random() * 40 + 20,
        x: Math.random() * 100,
        y: Math.random() * 100,
        duration: Math.random() * 2 + 1,
        delay: Math.random() * 2,
    }));

export const floatingEmojis = Array(15)
    .fill(0)
    .map((_, i) => ({
        id: i,
        emoji: ["🎉", "🏆", "👏", "💯", "✨", "🎊", "🌟", "💫"][
            Math.floor(Math.random() * 8)
        ],
        size: Math.random() * 20 + 30,
        x: Math.random() * 100,
        y: 100 + Math.random() * 20,
        duration: Math.random() * 10 + 10,
        delay: Math.random() * 5,
    }));
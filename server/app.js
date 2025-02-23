require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

app.use(express.static("public"));

// 🎙️ Generate AI Voice Feedback
const fs = require("fs");
const path = require("path");

async function generateCoachingFeedback(feedbackText) {
    try {
        console.log("🎙️ Requesting AI voice from ElevenLabs:", feedbackText);

        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/9BWtsMINqrJLrRacOk9x/stream`, // Public voice id for the voice im using
            {
                text: feedbackText,
                model_id: "eleven_monolingual_v1",
                voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            },
            {
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                },
                responseType: "stream" // ✅ This ensures we handle audio properly
            }
        );

        const audioFilePath = path.join(__dirname, "ai_feedback.mp3");
        const writer = fs.createWriteStream(audioFilePath);

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on("finish", () => {
                console.log("✅ AI Voice Saved:", audioFilePath);
                resolve(`/ai_feedback.mp3`); // ✅ Send this path to frontend
            });
            writer.on("error", reject);
        });

    } catch (error) {
        console.error("❌ Error requesting ElevenLabs API:", error.response ? error.response.data : error.message);
        return null;
    }
}


// 🏏 Real-Time Swing Feedback
// ✅ Serve AI-generated feedback file
app.get("/ai_feedback.mp3", (req, res) => {
    res.sendFile(path.join(__dirname, "ai_feedback.mp3"));
});

io.on("connection", (socket) => {
    console.log("✅ Player connected.");

    socket.on("swingAnalysis", async (feedbackText) => {
        console.log(`📥 Received Swing Feedback: "${feedbackText}" at ${new Date().toLocaleTimeString()}`);

        const coachingAudio = await generateCoachingFeedback(feedbackText);
        if (coachingAudio) {
            console.log("📤 Sending AI Voice Feedback URL:", coachingAudio);
            socket.emit("realTimeFeedback", coachingAudio);
        } else {
            console.error("❌ Failed to generate AI voice feedback.");
        }
    });

    socket.on("disconnect", () => console.log("❌ Player disconnected."));
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));

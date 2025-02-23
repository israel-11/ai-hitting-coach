let detector;
let lastSwingTime = 0;
let lastWristX = 0;
let lastWristY = 0;
let lastHipX = 0; // ✅ FIX: Define lastHipX globally
let swingInProgress = false;
let swingAllowed = false;


const videoElement = document.getElementById("webcam");
const audioElement = document.getElementById("commentaryAudio");
const countdownElement = document.createElement("h2");
countdownElement.style.textAlign = "center";
countdownElement.innerText = "Get Ready...";
document.body.appendChild(countdownElement);

const socket = io();

// 🎥 Enable Webcam
navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    videoElement.srcObject = stream;
});

// 🚀 Load MoveNet Model
async function loadMoveNet() {
    detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet);
    console.log("✅ MoveNet Loaded");

    videoElement.addEventListener("loadeddata", () => {
        console.log("✅ Webcam is ready!");
        startPoseDetection();
        startCountdown();
    });
}

// 🎥 Start Pose Detection Loop
function startPoseDetection() {
    setInterval(async () => {
        if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
            console.warn("⚠️ Video not ready, skipping frame...");
            return;
        }

        if (!detector || !swingAllowed) return;

        try {
            const poses = await detector.estimatePoses(videoElement);

            // console.log("📸 Raw poses data:", poses);

            if (!poses || !Array.isArray(poses) || poses.length === 0 || !poses[0]) {
                console.warn("⚠️ No pose detected, skipping frame...");
                return;
            }

            const keypoints = poses[0].keypoints;

            if (!keypoints || keypoints.length !== 17) {
                console.warn("⚠️ Keypoints missing or incorrect length, skipping frame...");
                return;
            }

            logKeypoints(keypoints);
            if (isValidKeypoints(keypoints)) {
                detectSwingErrors(keypoints);
            } else {
                // console.warn("⚠️ Some keypoints have low confidence, skipping swing detection.");
            }

        } catch (error) {
            console.error("❌ Error in pose estimation:", error);
        }
    }, 500);
}

// 📌 Validate Keypoints (Ensure all needed ones exist and have confidence > 0.5)
function isValidKeypoints(keypoints) {
    const requiredIndexes = [5, 9, 11]; // Left shoulder, left wrist, left hip

    return requiredIndexes.every(i => 
        keypoints[i] &&
        typeof keypoints[i].x !== 'undefined' &&
        typeof keypoints[i].y !== 'undefined' &&
        typeof keypoints[i].score !== 'undefined' &&
        keypoints[i].score > 0.5
    );
}

// 📌 Debugging: Log Keypoints to Console
function logKeypoints(keypoints) {
    // console.log("📸 Pose detected at:", new Date().toLocaleTimeString());

    keypoints.forEach((point, index) => {
        if (!point || typeof point.x === 'undefined' || typeof point.y === 'undefined' || typeof point.score === 'undefined') {
            console.warn(`⚠️ Keypoint ${index} is missing or invalid.`);
            return;
        }
        // console.log(`🔹x: ${point.x.toFixed(2)}, y: ${point.y.toFixed(2)}, confidence: ${point.score.toFixed(2)}`);
    });
}

// 🔍 Detect Swing Mistakes
function detectSwingErrors(keypoints) {
    const leftShoulder = keypoints[5]; 
    const rightWrist = keypoints[10]; 
    const leftHip = keypoints[11];  

    let currentTime = Date.now();
    let feedbackType = "";

    if (leftShoulder.score < 0.5 || rightWrist.score < 0.5 || leftHip.score < 0.5) {
        console.warn("⚠️ Low confidence in keypoints, skipping swing detection.");
        return;
    }

    let wristSpeedX = Math.abs(rightWrist.x - lastWristX) / (currentTime - lastSwingTime);
    let wristSpeedY = Math.abs(rightWrist.y - lastWristY) / (currentTime - lastSwingTime);
    let hipSpeedX = Math.abs(leftHip.x - lastHipX) / (currentTime - lastSwingTime); 

    lastSwingTime = currentTime;
    lastWristX = rightWrist.x;
    lastWristY = rightWrist.y;
    lastHipX = leftHip.x;

    let wristMovingFast = wristSpeedX > 0.003 || wristSpeedY > 0.003;
    let hipRotating = hipSpeedX > 0.004;  
    let fullArcMotion = wristSpeedX > wristSpeedY * 0.7;

    let handsStartRight = rightWrist.x > leftShoulder.x - 100;
    let handsEndLeft = rightWrist.x < leftShoulder.x + 50;

    let swingDetected = wristMovingFast && hipRotating && handsStartRight && handsEndLeft;

    if (swingDetected && !swingInProgress) {
        swingInProgress = true;
        console.log(`⚡ Swing DETECTED at ${new Date().toLocaleTimeString()}!`);
    }

        swingInProgress = false;
        console.log(`✅ Swing COMPLETED at ${new Date().toLocaleTimeString()}`);

        if (rightWrist.y > leftShoulder.y) {
            feedbackType = "You lower your hands.  Don't drop them.  You will loose power.";
        }

        if (leftHip.y > leftShoulder.y) {
            feedbackType = "Your shifting early. Try engaging your hips."; 
        }

        if (!feedbackType) {
            feedbackType = "That was a home run"; // ✅ AI will handle positive reinforcement
        }

        console.log("🚀 Sending AI Feedback Type:", feedbackType);
        socket.emit("swingAnalysis", feedbackType);

        startCountdown();
}




// ⏳ Start 5-Second Countdown Before Swinging
function startCountdown() {
    let countdown = 5;
    swingAllowed = false;
    console.log("⏳ Countdown Started - Wait for next swing...");
    countdownElement.innerText = `Get Ready in ${countdown} seconds...`;

    const interval = setInterval(() => {
        countdown--;
        console.log(`⏳ ${countdown} seconds remaining...`);
        countdownElement.innerText = `Get Ready in ${countdown} seconds...`;

        if (countdown === 0) {
            clearInterval(interval);
            console.log("✅ READY! Swing Now!");
            countdownElement.innerText = "Swing Now!";
            swingAllowed = true;
        }
    }, 1000);
}

// 🎧 Play AI Voice Feedback
socket.on("realTimeFeedback", (audioUrl) => {
    console.log("🔊 Received AI Voice Feedback URL:", audioUrl);

    if (!audioUrl) {
        console.error("❌ No AI feedback URL received.");
        return;
    }

    audioElement.src = audioUrl;
    audioElement.play().then(() => {
        console.log("🎧 AI Voice Feedback is playing!");
    }).catch(error => {
        console.error("⚠️ AI Voice Playback Failed:", error);
    });
});


// 📌 Load MoveNet on Startup
loadMoveNet();

// Replace with your actual n8n webhook URL
const N8N_WEBHOOK_URL = 'https://innergcomplete.app.n8n.cloud/webhook/84988548-6e5c-4119-81f1-9e93bbe37747';

const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');

let websocket;
let audioContext;
let audioQueue = [];

// Function to handle the full process
async function startConversation() {
    try {
        // --- Step 1: Get the Signed WebSocket URL from n8n ---
        statusDiv.textContent = 'Status: Getting ready...';
        startButton.disabled = true;

        const response = await fetch(N8N_WEBHOOK_URL);
        const data = await response.json();
        const signedUrl = data.signed_url;
        
        if (!signedUrl) {
            throw new Error('Failed to get signed URL from n8n.');
        }

        // --- Step 2: Establish the WebSocket Connection ---
        statusDiv.textContent = 'Status: Connecting to ElevenLabs...';
        websocket = new WebSocket(signedUrl);

        // Event listener for when the connection opens
        websocket.onopen = () => {
            console.log('WebSocket connection opened.');
            statusDiv.textContent = 'Status: Connected! You can start talking.';
            // Start listening to the microphone after a short delay
            setTimeout(startMicrophoneStream, 500); 
        };

        // Event listener for incoming messages (audio data from the agent)
        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.audio) {
                // Decode and play the incoming audio data
                playAudio(data.audio);
            }
        };

        // Event listener for connection closing
        websocket.onclose = () => {
            console.log('WebSocket connection closed.');
            statusDiv.textContent = 'Status: Connection closed.';
            startButton.disabled = false;
        };

        // Event listener for errors
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusDiv.textContent = 'Status: An error occurred.';
            startButton.disabled = false;
        };

    } catch (error) {
        console.error('Error in starting conversation:', error);
        statusDiv.textContent = `Status: Error - ${error.message}`;
        startButton.disabled = false;
    }
}

// --- Step 3: Handle Microphone Streaming ---
async function startMicrophoneStream() {
    try {
        // Request microphone access from the user
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
                // Send the microphone audio data to ElevenLabs
                websocket.send(event.data);
            }
        };

        // Start recording and sending chunks every 250ms
        mediaRecorder.start(250); 
    } catch (error) {
        console.error('Microphone access denied or failed:', error);
        statusDiv.textContent = 'Status: Please allow microphone access to talk.';
        websocket.close();
    }
}

// --- Step 4: Handle Audio Playback ---
async function playAudio(base64Audio) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Decode the base64 string to a buffer
    const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;

    try {
        const audioBuffer = await audioContext.decodeAudioData(audioData);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();

    } catch (error) {
        console.error('Error decoding or playing audio:', error);
    }
}

// Add the event listener to the button
startButton.addEventListener('click', startConversation);

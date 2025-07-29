// Replace with your actual n8n webhook URL
const N8N_WEBHOOK_URL = 'https://innergcomplete.app.n8n.cloud/webhook/84988548-6e5c-4119-81f1-9e93bbe37747';

// Replace with your ElevenLabs Agent ID
const AGENT_ID = '07SRhAkpaGG5svmcKAlh'; 

const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');

let websocket;
let audioContext;

async function startConversation() {
    try {
        statusDiv.textContent = 'Status: Getting ready...';
        startButton.disabled = true;

        const response = await fetch(N8N_WEBHOOK_URL);
        const data = await response.json();
        const signedUrl = data.signed_url;
        
        if (!signedUrl) {
            throw new Error('Failed to get signed URL from n8n.');
        }

        statusDiv.textContent = 'Status: Connecting to ElevenLabs...';
        websocket = new WebSocket(signedUrl);

        websocket.onopen = () => {
            console.log('WebSocket connection opened.');
            // --- NEW: Send the initial JSON configuration message ---
            const initialConfig = {
                "type": "start",
                "agent_id": AGENT_ID, // Use the agent ID
                "language": "en",
                "sample_rate": 44100
            };
            websocket.send(JSON.stringify(initialConfig));
            statusDiv.textContent = 'Status: Connected! You can start talking.';
            startMicrophoneStream(); // Now, start the microphone after the config is sent.
        };

        websocket.onmessage = (event) => {
            // Your existing onmessage logic
            const data = JSON.parse(event.data);
            if (data.audio) {
                playAudio(data.audio);
            }
            if (data.type === 'response') {
                // You can add logic here to handle the response text if needed
                console.log('Agent says:', data.text);
            }
        };

        websocket.onclose = () => {
            console.log('WebSocket connection closed.');
            statusDiv.textContent = 'Status: Connection closed.';
            startButton.disabled = false;
        };

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

// --- Microphone streaming is now called *after* the initial config is sent ---
async function startMicrophoneStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
                // Send the audio data as a binary blob
                websocket.send(event.data);
            }
        };

        mediaRecorder.start(250); 
    } catch (error) {
        console.error('Microphone access denied or failed:', error);
        statusDiv.textContent = 'Status: Please allow microphone access to talk.';
        websocket.close();
    }
}

async function playAudio(base64Audio) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
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

startButton.addEventListener('click', startConversation);

// --- CONFIGURATION ---
// Replace with your actual n8n webhook URL. This URL triggers your workflow
// to get the signed WebSocket URL from ElevenLabs.
const N8N_WEBHOOK_URL = 'https://innergcomplete.app.n8n.cloud/webhook/84988548-6e5c-4119-81f1-9e93bbe37747';

// Replace with your ElevenLabs Agent ID. This ID is used in the initial
// WebSocket message to identify the agent you want to talk to.
const AGENT_ID = '07SRhAkpaGG5svmcKAlh'; 


// --- DOM ELEMENTS ---
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');


// --- GLOBAL VARIABLES ---
let websocket;
let audioContext;
// This flag is crucial to prevent sending audio data before the initial
// configuration message has been sent and acknowledged by the server.
let readyToSendAudio = false; 


// --- MAIN FUNCTION TO START THE CONVERSATION ---
async function startConversation() {
    try {
        statusDiv.textContent = 'Status: Getting ready...';
        startButton.disabled = true;

        // Step 1: Call the n8n webhook to get the signed WebSocket URL
        console.log('Fetching signed URL from n8n...');
        const response = await fetch(N8N_WEBHOOK_URL);
        const data = await response.json();
        const signedUrl = data.signed_url;
        
        if (!signedUrl) {
            throw new Error('Failed to get signed URL from n8n. Please check your n8n workflow logs.');
        }
        console.log('Successfully got signed URL:', signedUrl);

        // Step 2: Establish the WebSocket connection
        statusDiv.textContent = 'Status: Connecting to ElevenLabs...';
        websocket = new WebSocket(signedUrl);

        // Event listener for when the connection opens
        websocket.onopen = () => {
            console.log('WebSocket connection opened successfully.');
            
            // --- Crucial Step ---
            // The very first message sent must be a JSON object with a 'start' type.
            const initialConfig = {
                "type": "start",
                "agent_id": AGENT_ID,
                "language": "en",
                "sample_rate": 44100
            };
            const messageToSend = JSON.stringify(initialConfig);
            console.log('Prepared initial config message:', messageToSend);

            // Send the initial JSON configuration message
            websocket.send(messageToSend);
            
            // Set the flag to true ONLY AFTER the initial config is sent
            readyToSendAudio = true; 
            
            statusDiv.textContent = 'Status: Connected! You can start talking.';
            startMicrophoneStream();
        };

        // Event listener for incoming messages (audio data from the agent)
        websocket.onmessage = (event) => {
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            if (data.audio) {
                // Decode and play the incoming audio data
                playAudio(data.audio);
            }
            if (data.type === 'response') {
                console.log('Agent says:', data.text);
            }
        };

        // Event listener for when the connection closes
        websocket.onclose = (event) => {
            console.log('WebSocket connection closed.', 'Code:', event.code, 'Reason:', event.reason);
            statusDiv.textContent = `Status: Connection closed. Code: ${event.code}`;
            startButton.disabled = false;
            // Handle cleanup if needed
        };

        // Event listener for any WebSocket errors
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusDiv.textContent = 'Status: An error occurred. Check console for details.';
            startButton.disabled = false;
        };

    } catch (error) {
        console.error('Error in starting conversation:', error);
        statusDiv.textContent = `Status: Error - ${error.message}`;
        startButton.disabled = false;
    }
}


// --- FUNCTION TO HANDLE MICROPHONE STREAMING ---
async function startMicrophoneStream() {
    try {
        // Request microphone access from the user
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            // --- CRUCIAL CHECK ---
            // Only send data if the connection is open AND our flag is true
            if (readyToSendAudio && event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
                websocket.send(event.data);
            }
        };

        // Start recording and sending chunks every 250ms
        mediaRecorder.start(250); 
    } catch (error) {
        console.error('Microphone access denied or failed:', error);
        statusDiv.textContent = 'Status: Please allow microphone access to talk.';
        // If microphone access fails, we must close the WebSocket to avoid errors
        if (websocket) {
            websocket.close();
        }
    }
}


// --- FUNCTION TO HANDLE AUDIO PLAYBACK FROM AGENT ---
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


// --- EVENT LISTENER FOR THE BUTTON ---
startButton.addEventListener('click', startConversation);

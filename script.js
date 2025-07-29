// --- CONFIGURATION ---
// IMPORTANT: Replace this with the Production URL of your n8n webhook.
// This webhook will be responsible for calling the ElevenLabs API to
// get the *actual* signed WebSocket URL and returning it to this client.
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
// This flag is crucial to prevent sending microphone audio data before the
// initial 'start' configuration message has been successfully sent to
// ElevenLabs and the WebSocket connection is fully ready.
let readyToSendAudio = false; 


// --- MAIN FUNCTION TO START THE CONVERSATION ---
async function startConversation() {
    try {
        statusDiv.textContent = 'Status: Getting ready...';
        startButton.disabled = true;
        readyToSendAudio = false; // Reset flag on new conversation attempt

        // Step 1: Call the n8n webhook to get the signed WebSocket URL
        console.log('Attempting to fetch signed URL from n8n webhook:', N8N_WEBHOOK_URL);
        
        const response = await fetch(N8N_WEBHOOK_URL);
        
        // Check if the HTTP request to n8n itself was successful
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`n8n webhook call failed with status: ${response.status}. Response: ${errorText}`);
        }
        
        const data = await response.json();
        const signedUrl = data.signed_url;
        
        // Verify that n8n returned the 'signed_url'
        if (!signedUrl) {
            throw new Error('n8n returned a response, but it did not contain a "signed_url". Please check your n8n "Respond to Webhook" node configuration.');
        }
        
        console.log('Successfully received signed URL from n8n:', signedUrl);

        // Step 2: Establish the WebSocket connection using the signed URL
        statusDiv.textContent = 'Status: Connecting to ElevenLabs...';
        console.log('Attempting to open WebSocket to:', signedUrl);
        websocket = new WebSocket(signedUrl);

        // Event listener for when the WebSocket connection opens successfully
        websocket.onopen = () => {
            console.log('WebSocket connection opened successfully to ElevenLabs.');
            
            // --- Crucial Step for ElevenLabs Protocol ---
            // The very first message sent over the WebSocket must be a JSON object
            // of type 'start' to configure the conversation session.
            const initialConfig = {
                "type": "start",
                "agent_id": AGENT_ID,
                "language": "en", // Specify the language of the conversation
                "sample_rate": 44100 // Sample rate for audio (common for web audio)
            };
            const messageToSend = JSON.stringify(initialConfig);
            console.log('Prepared initial config message to send:', messageToSend);

            // Send the initial JSON configuration message to ElevenLabs
            websocket.send(messageToSend);
            
            // Set the flag to true ONLY AFTER the initial config message has been sent.
            // This prevents microphone data from being sent prematurely.
            readyToSendAudio = true; 
            
            statusDiv.textContent = 'Status: Connected! You can start talking.';
            startMicrophoneStream(); // Now, safely start streaming microphone audio
        };

        // Event listener for incoming messages from the ElevenLabs agent
        websocket.onmessage = (event) => {
            // console.log('Received raw message:', event.data); // Log raw data for deep debugging
            const data = JSON.parse(event.data);
            
            if (data.audio) {
                // If the message contains audio data, play it back to the user
                playAudio(data.audio);
            }
            if (data.type === 'response' && data.text) {
                // If the message contains a text response, log it
                console.log('Agent says (text):', data.text);
            }
            // You might receive other message types (e.g., 'ping', 'user_transcript')
            // based on ElevenLabs API documentation. Handle them as needed.
        };

        // Event listener for when the WebSocket connection closes
        websocket.onclose = (event) => {
            console.log('WebSocket connection closed.', 'Code:', event.code, 'Reason:', event.reason);
            statusDiv.textContent = `Status: Connection closed. Code: ${event.code}.`;
            startButton.disabled = false;
            // Perform any necessary cleanup here (e.g., stop microphone, clear queues)
        };

        // Event listener for any WebSocket errors
        websocket.onerror = (error) => {
            console.error('WebSocket error occurred:', error);
            statusDiv.textContent = 'Status: An error occurred. Please check console for details.';
            startButton.disabled = false;
        };

    } catch (error) {
        // Catch any errors that occur during the fetch or WebSocket setup
        console.error('Error in starting conversation process:', error);
        statusDiv.textContent = `Status: Error - ${error.message}`;
        startButton.disabled = false;
    }
}


// --- FUNCTION TO HANDLE MICROPHONE STREAMING ---
async function startMicrophoneStream() {
    try {
        // Request microphone access from the user's browser
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create a MediaRecorder to capture audio chunks
        // 'audio/webm' is a common and widely supported format for streaming
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            // Only send audio data if:
            // 1. The 'readyToSendAudio' flag is true (initial config sent)
            // 2. The audio chunk has data (size > 0)
            // 3. The WebSocket connection is still open
            if (readyToSendAudio && event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
                websocket.send(event.data);
            }
        };

        // Start recording and send data chunks every 250 milliseconds.
        // This creates a continuous stream of audio.
        mediaRecorder.start(250); 
        console.log('Microphone stream started.');

    } catch (error) {
        console.error('Microphone access denied or failed:', error);
        statusDiv.textContent = 'Status: Please allow microphone access to talk.';
        // If microphone access fails, close the WebSocket connection as it cannot proceed
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close();
        }
    }
}


// --- FUNCTION TO HANDLE AUDIO PLAYBACK FROM AGENT ---
async function playAudio(base64Audio) {
    // Initialize AudioContext if it hasn't been already
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Convert the base64 audio string to an ArrayBuffer
    // This is necessary for AudioContext.

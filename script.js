// --- CONFIGURATION ---

// IMPORTANT: Replace this with the Production URL of your n8n webhook.

const N8N_WEBHOOK_URL = 'https://innergcomplete.app.n8n.cloud/webhook/84988548-6e5c-4119-81f1-9e93bbe37747';


// Replace with your ElevenLabs Agent ID.

const AGENT_ID = '07SRhAkpaGG5svmcKAlh'; 


// IMPORTANT: You need to get these IDs from your ElevenLabs account.

// 1. Get the voice ID from the 'Voice Lab' or 'Voices' section.

// 2. The model ID for conversational AI is typically a variant of 'eleven_multilingual_v2'.

//    A common one is 'eleven_multilingual_v2_convai'.

const VOICE_ID = 'QYmulHXHr8imt56OqKpj'; 

const MODEL_ID = 'eleven_multilingual_v2_convai';


// --- DOM ELEMENTS ---
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');


// --- GLOBAL VARIABLES ---
let websocket;
let audioContext;
let readyToSendAudio = false; 


// --- MAIN FUNCTION TO START THE CONVERSATION ---
async function startConversation() {
    try {
        statusDiv.textContent = 'Status: Getting ready...';
        startButton.disabled = true;
        readyToSendAudio = false;

        console.log('Attempting to fetch signed URL from n8n webhook:', N8N_WEBHOOK_URL);
        
        const response = await fetch(N8N_WEBHOOK_URL);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`n8n webhook call failed with status: ${response.status}. Response: ${errorText}`);
        }
        
        const data = await response.json();
        const signedUrl = data.signed_url;
        
        if (!signedUrl) {
            throw new Error('n8n returned a response, but it did not contain a "signed_url".');
        }
        
        console.log('Successfully received signed URL from n8n:', signedUrl);
        
        statusDiv.textContent = 'Status: Connecting to ElevenLabs...';
        console.log('Attempting to open WebSocket to:', signedUrl);
        websocket = new WebSocket(signedUrl);

        websocket.onopen = () => {
            console.log('WebSocket connection opened successfully to ElevenLabs.');
            
            const initialConfig = {
                "type": "start",
                "agent_id": AGENT_ID,
                "language": "en",
                "sample_rate": 44100,
                "voice_id": VOICE_ID,
                "model_id": MODEL_ID
            };
            const messageToSend = JSON.stringify(initialConfig);
            
            console.log('Prepared initial config message to send:', messageToSend);

            websocket.send(messageToSend);
            
            readyToSendAudio = true; 
            
            statusDiv.textContent = 'Status: Connected! You can start talking.';
            startMicrophoneStream();
        };

        websocket.onmessage = (event) => {
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.audio) {
                playAudio(data.audio);
            }
            if (data.type === 'response' && data.text) {
                console.log('Agent says (text):', data.text);
            }
        };

        websocket.onclose = (event) => {
            console.log('WebSocket connection closed.', 'Code:', event.code, 'Reason:', event.reason);
            statusDiv.textContent = `Status: Connection closed. Code: ${event.code}.`;
            startButton.disabled = false;
        };

        websocket.onerror = (error) => {
            console.error('WebSocket error occurred:', error);
            statusDiv.textContent = 'Status: An error occurred. Please check console for details.';
            startButton.disabled = false;
        };

    } catch (error) {
        console.error('Error in starting conversation process:', error);
        statusDiv.textContent = `Status: Error - ${error.message}`;
        startButton.disabled = false;
    }
}


// --- FUNCTION TO HANDLE MICROPHONE STREAMING ---
async function startMicrophoneStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            // --- CRITICAL CHANGE ---
            // Only send the data if it exists. The first ondataavailable event
            // can sometimes fire with an empty blob.
            if (event.data.size > 0 && readyToSendAudio && websocket.readyState === WebSocket.OPEN) {
                websocket.send(event.data);
            }
        };

        mediaRecorder.start(250); 
        console.log('Microphone stream started.');

    } catch (error) {
        console.error('Microphone access denied or failed:', error);
        statusDiv.textContent = 'Status: Please allow microphone access to talk.';
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close();
        }
    }
}


// --- FUNCTION TO HANDLE AUDIO PLAYBACK FROM AGENT ---
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


// --- EVENT LISTENER FOR THE BUTTON ---
startButton.addEventListener('click', startConversation);

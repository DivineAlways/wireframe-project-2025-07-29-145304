// --- CONFIGURATION ---
console.log('Loading script.js - Version with FIXED PCM audio playback v3');

// IMPORTANT: Replace this with the Production URL of your n8n webhook.


const N8N_WEBHOOK_URL = 'https://innergcomplete.app.n8n.cloud/webhook/84988548-6e5c-4119-81f1-9e93bbe37747';


// Replace with your ElevenLabs Agent ID.


const AGENT_ID = '07SRhAkpaGG5svmcKAlh'; 




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
                "sample_rate": 16000,
                "voice_id": VOICE_ID,
                "model_id": MODEL_ID
            };
            const messageToSend = JSON.stringify(initialConfig);
            
            console.log('Prepared initial config message to send:', messageToSend);

            websocket.send(messageToSend);
            
            readyToSendAudio = true; 
            
            statusDiv.textContent = 'Status: Connected! You can start talking.';
            
            // Start microphone immediately
            startMicrophoneStream();
        };

        websocket.onmessage = (event) => {
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.audio_event && data.audio_event.audio_base_64) {
                playAudio(data.audio_event.audio_base_64);
            }
            if (data.agent_response_event && data.agent_response_event.agent_response) {
                console.log('Agent says:', data.agent_response_event.agent_response);
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
// Stream raw 16kHz PCM audio via Web Audio API
async function startMicrophoneStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Use browser's default sample rate, then resample to 16kHz
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        // Don't connect to destination to avoid sample rate conflicts
        console.log('Microphone stream started. Browser sample rate:', audioContext.sampleRate);
        
        processor.onaudioprocess = (e) => {
            if (!readyToSendAudio || websocket.readyState !== WebSocket.OPEN) return;
            const inputData = e.inputBuffer.getChannelData(0);
            // Resample from browser rate to 16kHz
            const resampled = resampleTo16kHz(inputData, audioContext.sampleRate);
            const pcm16 = convertFloat32ToInt16(resampled);
            // Only send if there's actual audio data (not silence)
            const hasAudio = resampled.some(sample => Math.abs(sample) > 0.01);
            if (hasAudio) {
                console.log('Sending PCM audio chunk, size:', pcm16.byteLength, 'bytes');
                websocket.send(pcm16);
            }
        };
    } catch (error) {
        console.error('Microphone access denied or failed:', error);
        statusDiv.textContent = 'Status: Please allow microphone access to talk.';
        if (websocket && websocket.readyState === WebSocket.OPEN) websocket.close();
    }
}

// Simple resampling function to convert to 16kHz
function resampleTo16kHz(inputBuffer, inputSampleRate) {
    const targetSampleRate = 16000;
    const ratio = inputSampleRate / targetSampleRate;
    const outputLength = Math.round(inputBuffer.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
        const sourceIndex = Math.round(i * ratio);
        output[i] = inputBuffer[Math.min(sourceIndex, inputBuffer.length - 1)];
    }
    
    return output;
}

// Helper to convert Float32Array to Int16Array buffer
function convertFloat32ToInt16(buffer) {
    const l = buffer.length;
    const result = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result.buffer;
}


// --- FUNCTION TO HANDLE AUDIO PLAYBACK FROM AGENT ---
async function playAudio(base64Audio) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    try {
        // Decode base64 to raw PCM bytes
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Convert bytes to 16-bit PCM samples
        const pcm16Data = new Int16Array(bytes.buffer);
        
        // Create audio buffer for 16kHz mono PCM
        const audioBuffer = audioContext.createBuffer(1, pcm16Data.length, 16000);
        const channelData = audioBuffer.getChannelData(0);
        
        // Convert Int16 to Float32 and copy to audio buffer
        for (let i = 0; i < pcm16Data.length; i++) {
            channelData[i] = pcm16Data[i] / 32768; // Convert to -1.0 to 1.0 range
        }
        
        // Play the audio
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
        
    } catch (error) {
        console.error('Error playing audio:', error);
    }
}


// --- EVENT LISTENER FOR THE BUTTON ---
startButton.addEventListener('click', startConversation);

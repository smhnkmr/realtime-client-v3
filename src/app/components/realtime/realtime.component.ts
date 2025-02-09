import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

@Component({
    selector: 'app-realtime',
    templateUrl: './realtime.component.html',
    styleUrls: ['./realtime.component.scss']
})
export class RealtimeComponent implements OnInit {
    @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
    @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
    @ViewChild('chatLog') chatLog!: ElementRef<HTMLDivElement>;

    private readonly URL = "ws://localhost:9083";
    private context: CanvasRenderingContext2D | null = null;
    private stream: MediaStream | null = null;
    private currentFrameB64: string | undefined;
    private webSocket: WebSocket | null = null;
    private audioContext: AudioContext | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private processor: ScriptProcessorNode | null = null;
    private pcmData: number[] = [];
    private interval: any = null;
    private initialized = false;
    private audioInputContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    isCallActive: boolean = false; // new property to toggle main content

    async ngOnInit() {
        // <!-- ...existing code removed: initialization moved to startCall() ... -->
    }

    // New method to toggle start call and initialize when needed
    async startCall(): Promise<void> {
        if (!this.isCallActive) {
            await this.startScreenShare();
            await this.initializeAudioContext();
            this.connect();
            setInterval(() => this.captureImage(), 3000);
            this.isCallActive = true;
            this.context = this.canvasElement.nativeElement.getContext('2d');
        } else {
            this.isCallActive = false;
        }
    }

    ngAfterViewInit() {
        //this.context = this.canvasElement.nativeElement.getContext('2d');
    }

    private async startScreenShare() {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { max: 640 },
                    height: { max: 480 },
                },
            });

            this.videoElement.nativeElement.srcObject = this.stream;
            await new Promise(resolve => {
                this.videoElement.nativeElement.onloadedmetadata = () => {
                    console.log("video loaded metadata");
                    resolve(true);
                }
            });

        } catch (err) {
            console.error("Error accessing the screen: ", err);
        }
    }

    private captureImage() {
        if (this.stream && 
                this.videoElement.nativeElement.videoWidth > 0 && 
                this.videoElement.nativeElement.videoHeight > 0 && 
                this.context) {
            const canvas = this.canvasElement.nativeElement;
            canvas.width = 640;
            canvas.height = 480;
            this.context.drawImage(this.videoElement.nativeElement, 0, 0, canvas.width, canvas.height);
            this.currentFrameB64 = canvas.toDataURL("image/jpeg").split(",")[1].trim();
        } else {
            console.log("no stream or video metadata not loaded");
        }
    }

    private connect(): void {
        console.log("connecting: ", this.URL);
        this.webSocket = new WebSocket(this.URL);

        this.webSocket.onclose = (event) => {
            console.log("websocket closed: ", event);
            alert("Connection closed");
        };

        this.webSocket.onerror = (event) => {
            console.log("websocket error: ", event);
        };

        this.webSocket.onopen = (event) => {
            console.log("websocket open: ", event);
            this.sendInitialSetupMessage();
        };

        this.webSocket.onmessage = this.receiveMessage.bind(this);
    }

    private sendInitialSetupMessage(): void {
        console.log("sending setup message");
        const setup_client_message = {
            setup: {
                generation_config: { response_modalities: ["AUDIO"] },
            },
        };
        this.webSocket?.send(JSON.stringify(setup_client_message));
    }

    private sendVoiceMessage(b64PCM: string): void {
        if (!this.webSocket) {
            console.log("websocket not initialized");
            return;
        }

        const payload = {
            realtime_input: {
                media_chunks: [{
                    mime_type: "audio/pcm",
                    data: b64PCM,
                },
                {
                    mime_type: "image/jpeg",
                    data: this.currentFrameB64,
                }],
            },
        };

        this.webSocket.send(JSON.stringify(payload));
        console.log("sent: ", payload);
    }

    private receiveMessage(event: MessageEvent): void {
        const messageData = JSON.parse(event.data);
        const response = new Response(messageData);

        if (response.text) {
            this.displayMessage("GEMINI: " + response.text);
        }
        if (response.audioData) {
            this.injestAudioChuckToPlay(response.audioData);
        }
    }

    private async initializeAudioContext(): Promise<void> {
        if (this.initialized) return;

        try {
                this.audioInputContext = new AudioContext({ sampleRate: 24000 });
                const moduleURL = new URL('/assets/pcm-processor.js', window.location.href);
                await this.audioInputContext.audioWorklet.addModule(moduleURL.href);
                
                this.workletNode = new AudioWorkletNode(this.audioInputContext, 'pcm-processor');
                this.workletNode.connect(this.audioInputContext.destination);
                
                this.workletNode.onprocessorerror = (err) => {
                    console.error('Audio processor error:', err);
                };
                
                this.initialized = true;
                console.log('Audio worklet initialized successfully');
            } catch (error) {
                console.error('Failed to initialize audio worklet:', error);
                this.initialized = false;
                throw error;
            }
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    private convertPCM16LEToFloat32(pcmData: ArrayBuffer): Float32Array {
        const inputArray = new Int16Array(pcmData);
        const float32Array = new Float32Array(inputArray.length);

        for (let i = 0; i < inputArray.length; i++) {
            float32Array[i] = inputArray[i] / 32768;
        }

        return float32Array;
    }

    private async injestAudioChuckToPlay(base64AudioChunk: string): Promise<void> {
        try {
            if (this.audioInputContext?.state === "suspended") {
                await this.audioInputContext.resume();
            }
            const arrayBuffer = this.base64ToArrayBuffer(base64AudioChunk);
            const float32Data = this.convertPCM16LEToFloat32(arrayBuffer);

            this.workletNode?.port.postMessage(float32Data);
        } catch (error) {
            console.error("Error processing audio chunk:", error);
        }
    }

    private recordChunk(): void {
        const buffer = new ArrayBuffer(this.pcmData.length * 2);
        const view = new DataView(buffer);
        this.pcmData.forEach((value, index) => {
            view.setInt16(index * 2, value, true);
        });

        const base64 = btoa(
            String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer)))
        );

        this.sendVoiceMessage(base64);
        this.pcmData = [];
    }

    public async startAudioInput(): Promise<void> {
        console.log('Starting audio input...');
        this.audioContext = new AudioContext({
            sampleRate: 16000,
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 16000,
            },
        });

        const source = this.audioContext.createMediaStreamSource(stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.round(inputData[i] * 0x7fff);
            }
            this.pcmData.push(...pcm16);
        };

        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        this.interval = setInterval(() => this.recordChunk(), 3000);
    }

    public stopAudioInput(): void {
        console.log('Stopping audio input...');
        if (this.processor) {
            this.processor.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        clearInterval(this.interval);
    }

    private displayMessage(message: string) {
        console.log(message);
        this.addParagraphToDiv(message);
    }

    private addParagraphToDiv(text: string) {
        const newParagraph = document.createElement("p");
        newParagraph.textContent = text;
        this.chatLog.nativeElement.appendChild(newParagraph);
    }
}

// Keep the Response class as is
class Response {
  text: string | null = null;
  audioData: string | null = null;
  endOfTurn: boolean | null = null;

  constructor(data: any) {
    if (data.text) {
      this.text = data.text
    }
    if (data.audio) {
      this.audioData = data.audio;
    }
  }
}
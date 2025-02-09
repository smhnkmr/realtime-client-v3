import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { DialogService } from '../../services/dialog.service';
import { ProjectService } from '../../services/project.service';
import { SupabaseService } from '../../services/supabase.service';
import { Project } from '../../interfaces/project.interface';
import { map } from 'rxjs/operators';
import { Observable, interval, Subscription } from 'rxjs';

interface ChatMessage {
  type: 'sent' | 'received';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-gemini-chat',
  templateUrl: './gemini-chat.component.html',
  styleUrls: ['./gemini-chat.component.css']
})
export class GeminiChatComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  showVideo = false;
  videoMode: 'talk' | 'screen' | null = null;
  showContextMenu = false;
  contextMenuPosition = { x: 0, y: 0 };
  selectedProjectId: string | null = null;
  isMicOn: boolean = true;
  isScreenSharing: boolean = false;

  // Timer related properties
  private timerSubscription?: Subscription;
  callDuration: number = 0;
  formattedDuration: string = '00:00:00';

  chatMessages: ChatMessage[] = [];
  newMessage: string = '';

  get selectedProject$(): Observable<Project | undefined> {
    return this.projectService.projects$.pipe(
      map(projects => projects.find(p => p.id === this.selectedProjectId))
    );
  }

  constructor(
    public dialogService: DialogService,
    public projectService: ProjectService,
    private supabaseService: SupabaseService
  ) {
    this.chatMessages = [];
  }

  ngOnInit() {
    this.projectService.projects$.subscribe(projects => {
      if (projects.length > 0 && !this.selectedProjectId) {
        this.selectProject(projects[0].id);
      }
    });
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  private startTimer() {
    this.stopTimer(); // Stop any existing timer
    this.callDuration = 0;
    this.timerSubscription = interval(1000).subscribe(() => {
      this.callDuration++;
      this.updateFormattedDuration();
    });
  }

  private stopTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = undefined;
    }
    this.callDuration = 0;
    this.updateFormattedDuration();
  }

  private updateFormattedDuration() {
    const hours = Math.floor(this.callDuration / 3600);
    const minutes = Math.floor((this.callDuration % 3600) / 60);
    const seconds = this.callDuration % 60;

    this.formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  toggleVideo(mode: 'talk' | 'screen') {
    if (this.showVideo && this.videoMode === mode) {
      this.showVideo = false;
      this.videoMode = null;
      this.isCallActive = false;
      this.stopAudioInput();
      this.stopTimer();
    } else {
      this.showVideo = true;
      this.videoMode = mode;
      this.startCall();
      this.startTimer();
    }
  }

  sendChatMessage() {
    if (!this.newMessage.trim()) return;

    this.addMessage({
      type: 'sent',
      content: this.newMessage,
      timestamp: new Date()
    });

    setTimeout(() => {
      this.addMessage({
        type: 'received',
        content: `Response to: ${this.newMessage}`,
        timestamp: new Date()
      });
    }, 1000);

    this.newMessage = '';
  }

  private addMessage(message: ChatMessage) {
    this.chatMessages = [...this.chatMessages, message];
    setTimeout(() => this.scrollToBottom(), 0);
  }

  private scrollToBottom() {
    const element = this.messagesContainer.nativeElement;
    element.scrollTop = element.scrollHeight;
  }

  async signOut() {
    await this.supabaseService.signOut();
  }

  openApiKeyDialog() {
    this.dialogService.showDialog();
  }

  showProjectMenu(event: MouseEvent, projectId: string) {
    event.preventDefault();
    event.stopPropagation();
    this.selectedProjectId = projectId;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    this.showContextMenu = true;
  }

  hideContextMenu() {
    this.showContextMenu = false;
  }

  async handleContextMenuAction(action: 'edit' | 'delete') {
    if (this.selectedProjectId) {
      if (action === 'edit') {
        const project = await this.projectService.getProjectById(this.selectedProjectId).toPromise();
        if (project) {
          this.dialogService.showDialog(project);
        }
      }
    }
    this.hideContextMenu();
  }

  selectProject(projectId: string) {
    this.selectedProjectId = projectId;
  }

  toggleMic() {
    this.isMicOn = !this.isMicOn;
    if(this.isMicOn) {
      this.startAudioInput();
    } else {
      this.stopAudioInput();
    }
  }

  toggleScreenShare() {
    this.isScreenSharing = !this.isScreenSharing;
    if (this.isScreenSharing) {
      this.startScreenShare();
    } else {
      this.stopScreenShare();
    }
  }

  //#region  realtime

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
    private captureInterval: any = null; // added to store capture image interval
    private initialized = false;
    private audioInputContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    isCallActive: boolean = false; // new property to toggle main content

    // New method to toggle start call and initialize when needed
    async startCall(): Promise<void> {
      if (this.isCallActive) return; // Call already active
      await this.startScreenShare();
      await this.initializeAudioContext();
      this.connect();
      this.captureInterval = setInterval(() => this.captureImage(), 3000); // Save interval ID
      this.startAudioInput(); // Activate microphone
      this.isMicOn = true; // Ensure mic is flagged active
      this.isScreenSharing = true;
      this.isCallActive = true;
      this.context = this.canvasElement.nativeElement.getContext('2d');
    }

    // New endCall method to release all call-related resources
    async endCall(): Promise<void> {
      // Stop the screen sharing
      this.stopScreenShare();
      // Clear the capture interval if set
      if (this.captureInterval) {
        clearInterval(this.captureInterval);
        this.captureInterval = null;
      }
      // Stop the audio input
      this.stopAudioInput();
      // Close the websocket connection
      if (this.webSocket) {
        this.webSocket.close();
        this.webSocket = null;
      }
      // Call the new uninitialize method for the audio context
      await this.uninitializeAudioContext();
      // Reset the current frame base64
      this.currentFrameB64 = undefined;
      // Reset call flags
      this.isCallActive = false;
      this.isMicOn = false;
      this.isScreenSharing = false;
      this.showVideo = false;
    }

    ngAfterViewInit() {
        //this.context = this.canvasElement.nativeElement.getContext('2d');
    }

    private async startScreenShare() {
      try {
        this.stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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

    private stopScreenShare() {
      if (this.stream) {
        const tracks = this.stream.getTracks();
        tracks.forEach(track => track.stop());
        this.stream = null;
        this.videoElement.nativeElement.srcObject = null;
        console.log("Screen sharing stopped");
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

    // New method to uninitialize the audio context and related worklet resources
    private async uninitializeAudioContext(): Promise<void> {
        if (this.audioInputContext) {
            await this.audioInputContext.close();
            this.audioInputContext = null;
        }
        this.workletNode = null;
        this.initialized = false;
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
      const uint8Array = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 0x8000; // 32K chunks
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);
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

  //#endregion
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